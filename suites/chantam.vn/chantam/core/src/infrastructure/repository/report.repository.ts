import { isPointPolicyError } from '@/application/implementations/point/point-policy-errors';
import {
  IAdminConfigRepository,
  IFindAdminReportsParams,
  IFindAdminReportsResult,
  IPointLedgerRepository,
  IReporterStats,
  IReportRepository,
  IReviewReportByAdminCommand,
} from '@/domain/ports/repository';
import {
  ContentViolationPenaltyRuleCode,
  GiftPostStatuses,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IReportDto } from '@chantam.vn/chantam.core-lib/dto';
import { IReportEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  normalizeReportAbuseConfig,
  ReportAbuseConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';
import { updateReturning } from './update-returning';

interface IReportRow {
  report_id: string;
  reporter_user_id: string;
  reporter_username: string;
  target_type: ReportTargetTypes;
  target_id: string;
  target_label: string;
  reason: IReportDto['reason'];
  description: string;
  evidence_urls: string[];
  status: ReportStatuses;
  target_open_report_count: string;
  reviewed_by_user_id: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ReportRepository
  extends Repository<IReportEntity>
  implements IReportRepository
{
  /**
   * Nối tới cả ba loại đích. Một hằng dùng chung cho câu đọc và câu đếm —
   * hai bản sao sẽ lệch nhau khi một bên được sửa, và bộ lọc sẽ đếm khác
   * với thứ hiện ra trên màn hình.
   */
  private static readonly TargetJoins = `
    INNER JOIN users reporter ON reporter.global_id = report.reporter_user_id
    LEFT JOIN posts post
      ON report.target_type = 'POST' AND post.global_id = report.target_id
    LEFT JOIN users target_user
      ON report.target_type = 'USER' AND target_user.global_id = report.target_id
    LEFT JOIN content_comments target_comment
      ON report.target_type = 'COMMENT'
      AND target_comment.global_id = report.target_id
    LEFT JOIN users comment_author
      ON comment_author.global_id = target_comment.author_id
    LEFT JOIN chat_messages target_message
      ON report.target_type = 'CHAT_MESSAGE'
      AND target_message.global_id = report.target_id
    LEFT JOIN users message_sender
      ON message_sender.global_id = target_message.sender_id
  `;

  public constructor(
    @Inject(IReportEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
    @Inject(IPointLedgerRepository)
    private readonly pointLedger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {
    super(target, manager);
  }

  public async findTargetOwner(
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<string | null> {
    // Đích là NGƯỜI thì chính người đó là chủ — không tra bảng nào.
    if (targetType === ReportTargetTypes.USER) return targetId;

    const source =
      targetType === ReportTargetTypes.POST
        ? { table: 'posts', column: 'author_id' }
        : { table: 'content_comments', column: 'author_id' };

    const [row] = await this.manager.query<{ owner_id: string }[]>(
      `SELECT ${source.column} AS owner_id FROM ${source.table} WHERE global_id = $1`,
      [targetId],
    );

    return row?.owner_id ?? null;
  }

  public async findReporterStats(params: {
    abusiveOnly: boolean;
    limit: number;
  }): Promise<IReporterStats[]> {
    const config = normalizeReportAbuseConfig(
      await this.adminConfig.getConfigValue(ReportAbuseConfigKey),
    );

    // Ngưỡng đi vào SQL làm tham số, không nội suy vào chuỗi: nó đến từ cấu hình
    // động, và một giá trị lạ ghép thẳng vào câu lệnh là một lối tiêm.
    //
    // Chỉ đếm lượt ĐÃ có kết luận vào mẫu: một người vừa gửi 20 báo còn đang chờ
    // xử lý không phải người báo bừa, họ chỉ là người đang chờ.
    const rows = await this.manager.query<
      {
        user_id: string;
        username: string;
        total_reports: string;
        reviewed_reports: string;
        dismissed_reports: string;
        resolved_reports: string;
        dismissed_ratio: string | null;
        abusive: boolean;
      }[]
    >(
      `
        WITH tally AS (
          SELECT reporter.global_id AS user_id,
                 reporter.username,
                 COUNT(*) AS total_reports,
                 COUNT(*) FILTER (
                   WHERE report.status IN ('RESOLVED', 'DISMISSED')
                 ) AS reviewed_reports,
                 COUNT(*) FILTER (WHERE report.status = 'DISMISSED')
                   AS dismissed_reports,
                 COUNT(*) FILTER (WHERE report.status = 'RESOLVED')
                   AS resolved_reports
          FROM reports report
          INNER JOIN users reporter
            ON reporter.global_id = report.reporter_user_id
          WHERE reporter.deleted_at IS NULL
          GROUP BY reporter.global_id, reporter.username
        ), scored AS (
          SELECT tally.*,
                 CASE
                   WHEN reviewed_reports = 0 THEN NULL
                   ELSE ROUND(dismissed_reports * 100.0 / reviewed_reports)
                 END AS dismissed_ratio
          FROM tally
        )
        SELECT scored.*,
               (
                 reviewed_reports >= $1
                 AND dismissed_ratio IS NOT NULL
                 AND dismissed_ratio >= $2
               ) AS abusive
        FROM scored
        WHERE $3 = FALSE
           OR (
             reviewed_reports >= $1
             AND dismissed_ratio IS NOT NULL
             AND dismissed_ratio >= $2
           )
        ORDER BY dismissed_ratio DESC NULLS LAST, total_reports DESC
        LIMIT $4
      `,
      [
        config.minReports,
        config.dismissedRatioPercent,
        params.abusiveOnly,
        params.limit,
      ],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      totalReports: Number(row.total_reports),
      reviewedReports: Number(row.reviewed_reports),
      dismissedReports: Number(row.dismissed_reports),
      resolvedReports: Number(row.resolved_reports),
      dismissedRatioPercent:
        row.dismissed_ratio === null ? null : Number(row.dismissed_ratio),
      abusive: row.abusive === true,
    }));
  }

  public async targetExists(
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<boolean> {
    // Bình luận không xoá cứng mà đổi trạng thái, nên loại `REMOVED` ở đây:
    // báo xấu một câu đã bị gỡ thì Admin không còn gì để xử.
    if (targetType === ReportTargetTypes.COMMENT) {
      const [row] = await this.manager.query<{ exists: boolean }[]>(
        `SELECT EXISTS(
           SELECT 1 FROM content_comments
           WHERE global_id = $1 AND status <> 'REMOVED'
         ) AS "exists"`,
        [targetId],
      );
      return row?.exists === true;
    }

    // Chủ đề cũng không xoá cứng mà đổi trạng thái, nên loại `REMOVED` y như bình luận: báo
    // xấu một chủ đề đã gỡ thì Admin không còn gì để xử.
    if (targetType === ReportTargetTypes.DHARMA_THREAD) {
      const [row] = await this.manager.query<{ exists: boolean }[]>(
        `SELECT EXISTS(
           SELECT 1 FROM dharma_threads
           WHERE global_id = $1 AND status <> 'REMOVED'
         ) AS "exists"`,
        [targetId],
      );
      return row?.exists === true;
    }

    // Tin nhắn không có `deleted_at`: job dọn theo hạn XOÁ hẳn dòng. Nên chỉ
    // cần dòng còn đó là báo xấu được — kể cả tin đã thu hồi, vì chính việc
    // thu hồi sau khi gửi bậy là thứ Admin cần biết.
    if (targetType === ReportTargetTypes.CHAT_MESSAGE) {
      const [row] = await this.manager.query<{ exists: boolean }[]>(
        `SELECT EXISTS(
           SELECT 1 FROM chat_messages WHERE global_id = $1
         ) AS "exists"`,
        [targetId],
      );
      return row?.exists === true;
    }

    const table = targetType === ReportTargetTypes.POST ? 'posts' : 'users';
    const [row] = await this.manager.query<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM ${table} WHERE global_id = $1 AND deleted_at IS NULL) AS "exists"`,
      [targetId],
    );
    return row?.exists === true;
  }

  public async findOpenByReporterAndTarget(
    reporterUserId: string,
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<IReportEntity | null> {
    return this.findOne({
      where: {
        reporterUserId,
        targetType,
        targetId,
        status: In([ReportStatuses.PENDING, ReportStatuses.IN_REVIEW]),
      } as never,
    });
  }

  public async findAdminReports(
    params: IFindAdminReportsParams,
  ): Promise<IFindAdminReportsResult> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return;
      values.push(value);
      conditions.push(sql.replace('$?', `$${values.length}`));
    };
    add('report.status = $?', params.status);
    add('report.target_type = $?', params.targetType);
    add('report.reason = $?', params.reason);
    if (params.keyword) {
      values.push(params.keyword);
      const keyword = `$${values.length}`;
      conditions.push(`(
        report.description ILIKE '%' || ${keyword} || '%'
        OR reporter.username ILIKE '%' || ${keyword} || '%'
        OR post.title ILIKE '%' || ${keyword} || '%'
        OR target_user.username ILIKE '%' || ${keyword} || '%'
        OR target_user.full_name ILIKE '%' || ${keyword} || '%'
        OR target_comment.body ILIKE '%' || ${keyword} || '%'
        OR target_message.body ILIKE '%' || ${keyword} || '%'
      )`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.manager.query<IReportRow[]>(
      `${this.baseSelect()}
       ${where}
       ORDER BY target_open_report_count DESC, report.created_at ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, params.take, params.skip],
    );
    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total
       FROM reports report
       ${ReportRepository.TargetJoins}
       ${where}`,
      values,
    );
    return { items: rows.map((row) => this.map(row)), total: Number(total) };
  }

  public async findAdminByGlobalId(
    globalId: string,
  ): Promise<IReportDto | null> {
    const [row] = await this.manager.query<IReportRow[]>(
      `${this.baseSelect()} WHERE report.global_id = $1`,
      [globalId],
    );
    return row ? this.map(row) : null;
  }

  public async reviewByAdmin(
    command: IReviewReportByAdminCommand,
  ): Promise<boolean> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<
        {
          status: ReportStatuses;
          target_type: ReportTargetTypes;
          target_id: string;
        }[]
      >(
        `SELECT status, target_type, target_id
         FROM reports WHERE global_id = $1 FOR UPDATE`,
        [command.reportId],
      );
      if (
        !current ||
        ![ReportStatuses.PENDING, ReportStatuses.IN_REVIEW].includes(
          current.status,
        )
      )
        return false;

      if (
        command.status === ReportStatuses.RESOLVED &&
        current.target_type === ReportTargetTypes.POST
      )
        await this.rejectReportedPost(manager, {
          actorUserId: command.actorUserId,
          postId: current.target_id,
          reportId: command.reportId,
          reason: command.note,
        });

      if (
        command.status === ReportStatuses.RESOLVED &&
        current.target_type === ReportTargetTypes.COMMENT
      )
        await this.removeReportedComment(manager, {
          actorUserId: command.actorUserId,
          commentId: current.target_id,
          reason: command.note,
        });

      await manager.query(
        `UPDATE reports
         SET status = $2, reviewed_by_user_id = $3, review_note = $4,
             reviewed_at = now(), updated_at = now()
         WHERE global_id = $1`,
        [command.reportId, command.status, command.actorUserId, command.note],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs
           (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'REVIEW_REPORT', 'REPORT', $2, $3::jsonb, $4::jsonb, $5)`,
        [
          command.actorUserId,
          command.reportId,
          JSON.stringify({ status: current.status }),
          JSON.stringify({ status: command.status }),
          command.note,
        ],
      );
      return true;
    });
  }

  /**
   * Gỡ bài và phạt chủ bài trong CÙNG transaction với kết luận report.
   *
   * Chỉ đụng bài đang công khai hoặc còn sót ở hàng đợi cũ. Bài `RESERVED` có
   * giao dịch sống nên không được gỡ ngang; bài đã REJECTED thì
   * không phạt lại khi Admin xử lý thêm một report trùng đích.
   */
  /**
   * Gỡ bình luận trong CÙNG transaction với kết luận report.
   *
   * Trước 29/09 nhánh này không tồn tại: tài liệu §15.5 vẽ ba hành động nhưng chỉ
   * `POST` có hành động thật, nên Admin bấm RESOLVED trên một bình luận rồi phải tự
   * nhớ sang màn hình khác gỡ nó — và không bản ghi nào cho biết họ có làm hay
   * không.
   *
   * Đích `USER` thì CỐ Ý vẫn tách rời: đình chỉ một người phải là một quyết định
   * riêng, có cân nhắc, qua `PATCH /admin/users/:id/status`. Gỡ một dòng chữ và
   * khoá một tài khoản không cùng mức hệ quả.
   *
   * `status <> 'REMOVED'` để hai report cùng trỏ một bình luận không ghi audit hai
   * lần cho một lần gỡ.
   */
  private async removeReportedComment(
    manager: EntityManager,
    command: { actorUserId: string; commentId: string; reason: string },
  ): Promise<void> {
    const removed = await updateReturning<{ global_id: string }>(
      manager,
      `UPDATE content_comments
       SET status = 'REMOVED', updated_at = now()
       WHERE global_id = $1 AND status <> 'REMOVED'
       RETURNING global_id`,
      [command.commentId],
    );
    if (removed.length === 0) return;

    await manager.query(
      `INSERT INTO admin_audit_logs
         (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
       VALUES ($1, 'REMOVE_COMMENT', 'CONTENT_COMMENT', $2, $3::jsonb, $4::jsonb, $5)`,
      [
        command.actorUserId,
        command.commentId,
        JSON.stringify({ status: 'VISIBLE' }),
        JSON.stringify({ status: 'REMOVED' }),
        command.reason,
      ],
    );
  }

  private async rejectReportedPost(
    manager: EntityManager,
    command: {
      actorUserId: string;
      postId: string;
      reportId: string;
      reason: string;
    },
  ): Promise<void> {
    const [post] = await manager.query<
      { status: GiftPostStatuses; author_id: string }[]
    >(
      `SELECT status, author_id
       FROM posts
       WHERE global_id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [command.postId],
    );
    if (
      !post ||
      ![GiftPostStatuses.PUBLISHED, GiftPostStatuses.PENDING_REVIEW].includes(
        post.status,
      )
    )
      return;

    await manager.query(
      `UPDATE posts SET status = $2, updated_at = now() WHERE global_id = $1`,
      [command.postId, GiftPostStatuses.REJECTED],
    );

    try {
      await this.pointLedger.appendByRuleWithinTransaction(manager, {
        userId: post.author_id,
        ruleCode: ContentViolationPenaltyRuleCode,
        referenceType: 'REPORT',
        referenceId: command.reportId,
        // Một bài chỉ bị phạt một lần dù có nhiều người cùng báo và Admin xử lý
        // lần lượt từng report.
        idempotencyKey: `${ContentViolationPenaltyRuleCode}:POST:${command.postId}`,
        actor: command.actorUserId,
        source: 'ADMIN_REPORT',
        reason: command.reason,
      });
    } catch (error) {
      // Tắt rule là quyết định chính sách "không trừ điểm", không phải lý do
      // giữ nội dung vi phạm trên bảng tin. Lỗi database thật vẫn phải rollback.
      // Nuốt cả hai ngoại lệ chính sách, không chỉ "rule đã tắt". Rule này hiện
      // không có trần ngày, nhưng Admin đặt trần cho nó là một thao tác hợp lệ,
      // và khi đó việc xử lý báo xấu không được đổ theo.
      if (!isPointPolicyError(error)) throw error;
    }

    await manager.query(
      `INSERT INTO admin_audit_logs
         (actor_user_id, action, resource_type, resource_id,
          before_json, after_json, reason)
       VALUES ($1, 'MODERATE_POST', 'POST', $2, $3::jsonb, $4::jsonb, $5)`,
      [
        command.actorUserId,
        command.postId,
        JSON.stringify({ status: post.status }),
        JSON.stringify({
          status: GiftPostStatuses.REJECTED,
          sourceReportId: command.reportId,
        }),
        command.reason,
      ],
    );
  }

  private baseSelect(): string {
    return `
      SELECT report.global_id AS report_id,
             report.reporter_user_id, reporter.username AS reporter_username,
             report.target_type, report.target_id,
             CASE report.target_type
               WHEN 'POST' THEN COALESCE(post.title, 'Bài đăng đã gỡ')
               WHEN 'USER' THEN COALESCE(target_user.full_name, '@' || target_user.username, 'Tài khoản đã xoá')
               WHEN 'COMMENT' THEN COALESCE(
                 '@' || comment_author.username || ': ' ||
                 CASE
                   WHEN length(target_comment.body) > 80
                     THEN left(target_comment.body, 77) || '...'
                   ELSE target_comment.body
                 END,
                 'Bình luận đã gỡ'
               )
               -- Tin đã thu hồi có body rỗng: nói thẳng là đã thu hồi, thay vì
               -- hiện một nhãn trống để Admin tưởng dữ liệu hỏng.
               WHEN 'CHAT_MESSAGE' THEN COALESCE(
                 '@' || message_sender.username || ': ' ||
                 CASE
                   WHEN target_message.recalled_at IS NOT NULL
                     THEN '(tin đã thu hồi)'
                   WHEN length(target_message.body) > 80
                     THEN left(target_message.body, 77) || '...'
                   ELSE target_message.body
                 END,
                 'Tin nhắn đã bị dọn theo hạn lưu trữ'
               )
             END AS target_label,
             report.reason, report.description, report.evidence_urls, report.status,
             (SELECT COUNT(*) FROM reports related
              WHERE related.target_type = report.target_type
                AND related.target_id = report.target_id
                AND related.status IN ('PENDING', 'IN_REVIEW'))::text AS target_open_report_count,
             report.reviewed_by_user_id, report.review_note, report.reviewed_at,
             report.created_at, report.updated_at
      FROM reports report
      ${ReportRepository.TargetJoins}
    `;
  }

  private map(row: IReportRow): IReportDto {
    return {
      reportId: row.report_id,
      reporterUserId: row.reporter_user_id,
      reporterUsername: row.reporter_username,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      reason: row.reason,
      description: row.description,
      evidenceUrls: row.evidence_urls ?? [],
      status: row.status,
      targetOpenReportCount: Number(row.target_open_report_count),
      reviewedByUserId: row.reviewed_by_user_id,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
