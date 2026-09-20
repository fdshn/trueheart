import {
  IFindAdminReportsParams,
  IFindAdminReportsResult,
  IReportRepository,
  IReviewReportByAdminCommand,
} from '@/domain/ports/repository';
import {
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IReportDto } from '@chantam.vn/chantam.core-lib/dto';
import { IReportEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';

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
  public constructor(
    @Inject(IReportEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async targetExists(
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<boolean> {
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
       INNER JOIN users reporter ON reporter.global_id = report.reporter_user_id
       LEFT JOIN posts post ON report.target_type = 'POST' AND post.global_id = report.target_id
       LEFT JOIN users target_user ON report.target_type = 'USER' AND target_user.global_id = report.target_id
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
      const [current] = await manager.query<{ status: ReportStatuses }[]>(
        `SELECT status FROM reports WHERE global_id = $1 FOR UPDATE`,
        [command.reportId],
      );
      if (
        !current ||
        ![ReportStatuses.PENDING, ReportStatuses.IN_REVIEW].includes(
          current.status,
        )
      )
        return false;

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

  private baseSelect(): string {
    return `
      SELECT report.global_id AS report_id,
             report.reporter_user_id, reporter.username AS reporter_username,
             report.target_type, report.target_id,
             CASE report.target_type
               WHEN 'POST' THEN COALESCE(post.title, 'Bài đăng đã gỡ')
               WHEN 'USER' THEN COALESCE(target_user.full_name, '@' || target_user.username, 'Tài khoản đã xoá')
             END AS target_label,
             report.reason, report.description, report.evidence_urls, report.status,
             (SELECT COUNT(*) FROM reports related
              WHERE related.target_type = report.target_type
                AND related.target_id = report.target_id
                AND related.status IN ('PENDING', 'IN_REVIEW'))::text AS target_open_report_count,
             report.reviewed_by_user_id, report.review_note, report.reviewed_at,
             report.created_at, report.updated_at
      FROM reports report
      INNER JOIN users reporter ON reporter.global_id = report.reporter_user_id
      LEFT JOIN posts post ON report.target_type = 'POST' AND post.global_id = report.target_id
      LEFT JOIN users target_user ON report.target_type = 'USER' AND target_user.global_id = report.target_id
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
