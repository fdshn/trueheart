import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  ICreateReportCommand,
  ICreateReportResult,
  ICreateReportUseCase,
  IGetAdminReportCommand,
  IGetAdminReportResult,
  IGetAdminReportUseCase,
  IListAdminReportsCommand,
  IListAdminReportsResult,
  IListAdminReportsUseCase,
  IListReporterStatsCommand,
  IListReporterStatsResult,
  IListReporterStatsUseCase,
  IReviewReportCommand,
  IReviewReportResult,
  IReviewReportUseCase,
} from '@/application/contracts/report';
import {
  ContentCommentNotFoundException,
  PostNotFoundException,
  ReportDuplicatedException,
  ReportInvalidStateException,
  ReportNotFoundException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IReportRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  NotificationTypes,
  ReportStatuses,
  ReportTargetTypes,
  ReportUpheldRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizeReportAbuseConfig,
  ReportAbuseConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isPointPolicyError } from '../point/point-policy-errors';

/** Một ngày, cho trần ngày của việc gửi báo xấu. */
const DayWindowSeconds = 24 * 60 * 60;

/**
 * Trần GỬI báo xấu, không phải trần thưởng.
 *
 * Trước 29/09 không có trần nào cả. Bình luận, chia sẻ, tin nhắn, đăng nhập, đăng
 * ký đều có; báo xấu thì không. Giới hạn duy nhất là
 * `UQ_reports_open_reporter_target` — mỗi người một báo đang mở cho mỗi ĐÍCH — nên
 * một người báo 500 đích khác nhau trong một phút là hoàn toàn hợp lệ, và mỗi lượt
 * là một mục trong hàng đợi Admin. Hậu quả không phải "người báo bừa không bị gì",
 * mà là **báo xấu thật bị chôn** dưới hàng trăm mục rác.
 *
 * Con số 10/ngày là baseline trong `docs/diagram/15-report.md`. Tài liệu từng so nó
 * với `REPORT_UPHELD.daily_cap = 5` rồi kết luận "hai con số khác nhau, cần soát" —
 * nhưng đó là so hai thứ không so được: 5 là trần THƯỞNG, và 10 là trần GỬI. Nay cả
 * hai đều tồn tại và không đụng nhau.
 */
const MaxReportsPerDay = 10;

/**
 * Trần PHÚT, chặn một lượt bắn bằng script.
 *
 * Trần ngày một mình vẫn cho phép gửi trọn 10 lượt trong hai giây — đủ để một
 * người dùng thật thấy hàng đợi Admin nhảy 10 mục cùng lúc, và không có lý do
 * chính đáng nào để báo xấu nhanh như vậy: mỗi lượt đòi một mô tả ít nhất 10 ký tự
 * về một đích cụ thể.
 */
const MaxReportsPerMinute = 3;

async function requirePermission(
  admin: IAdminConfigRepository,
  actorUserId: string,
  permission: string,
): Promise<void> {
  if (!(await admin.hasPermission(actorUserId, permission)))
    throw new ForbiddenException();
}

@Injectable()
export class CreateReportUseCase implements ICreateReportUseCase {
  public constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
  ) {}

  public async handle(
    command: ICreateReportCommand,
  ): Promise<ICreateReportResult> {
    const input = command.report;
    const description = input.description.trim();
    if (description.length < 10)
      throw new ValidationFailedException([
        'report.description phải có ít nhất 10 ký tự',
      ]);

    // Kiểm trần NGÀY trước trần PHÚT: chạm cả hai mà báo "thử lại sau 57 giây" là
    // nói sai — thật ra còn phải chờ nhiều giờ nữa. Cùng thứ tự với bình luận.
    await this.throttle.assertWithinLimit({
      bucket: 'report:day',
      key: command.reporterUserId,
      limit: MaxReportsPerDay,
    });
    await this.throttle.assertWithinLimit({
      bucket: 'report',
      key: command.reporterUserId,
      limit: MaxReportsPerMinute,
    });
    if (!(await this.reports.targetExists(input.targetType, input.targetId))) {
      if (input.targetType === ReportTargetTypes.POST)
        throw new PostNotFoundException(input.targetId);
      if (input.targetType === ReportTargetTypes.COMMENT)
        throw new ContentCommentNotFoundException();
      throw new UserNotFoundException();
    }
    if (
      await this.reports.findOpenByReporterAndTarget(
        command.reporterUserId,
        input.targetType,
        input.targetId,
      )
    )
      throw new ReportDuplicatedException();

    const report = this.reports.create({
      globalId: randomUUID(),
      reporterUserId: command.reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      description,
      evidenceUrls: input.evidenceUrls ?? [],
      status: ReportStatuses.PENDING,
      reviewedByUserId: null,
      reviewNote: null,
      reviewedAt: null,
    });
    await this.reports.save(report);

    // Đếm SAU khi ghi xong: đếm trước là trừ mất một suất cho một lượt bị chặn
    // ngay ở bước kiểm đích, tức phạt người dùng vì một báo xấu chưa từng vào sổ.
    await this.throttle.registerHit({
      bucket: 'report',
      key: command.reporterUserId,
      windowSeconds: 60,
    });
    await this.throttle.registerHit({
      bucket: 'report:day',
      key: command.reporterUserId,
      windowSeconds: DayWindowSeconds,
    });

    const created = await this.reports.findAdminByGlobalId(report.globalId);
    if (!created) throw new ReportNotFoundException();
    return { report: created };
  }
}

@Injectable()
export class ListAdminReportsUseCase implements IListAdminReportsUseCase {
  public constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminReportsCommand,
  ): Promise<IListAdminReportsResult> {
    await requirePermission(this.admin, command.actorUserId, 'report.read');
    const { skip, take } = toSkipTake(command);
    const result = await this.reports.findAdminReports({
      status: command.status ?? ReportStatuses.PENDING,
      targetType: command.targetType,
      reason: command.reason,
      keyword: command.keyword?.trim() || undefined,
      skip,
      take,
    });
    return {
      reports: result.items,
      meta: new PaginationMetaDto(
        Math.floor(skip / take) + 1,
        take,
        result.total,
      ),
    };
  }
}

@Injectable()
export class GetAdminReportUseCase implements IGetAdminReportUseCase {
  public constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetAdminReportCommand,
  ): Promise<IGetAdminReportResult> {
    await requirePermission(this.admin, command.actorUserId, 'report.read');
    const report = await this.reports.findAdminByGlobalId(command.reportId);
    if (!report) throw new ReportNotFoundException();
    return { report };
  }
}

@Injectable()
export class ReviewReportUseCase implements IReviewReportUseCase {
  public constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IAppendPointEntryUseCase)
    private readonly points: IAppendPointEntryUseCase,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: IReviewReportCommand,
  ): Promise<IReviewReportResult> {
    await requirePermission(this.admin, command.actorUserId, 'report.resolve');
    const note = command.review.note.trim();
    if (!note)
      throw new ValidationFailedException(['review.note không được để trống']);
    const existing = await this.reports.findAdminByGlobalId(command.reportId);
    if (!existing) throw new ReportNotFoundException();
    const changed = await this.reports.reviewByAdmin({
      actorUserId: command.actorUserId,
      reportId: command.reportId,
      status: command.review.status,
      note,
    });
    if (!changed) throw new ReportInvalidStateException();

    // Thưởng SAU khi Admin xác minh, không phải lúc gửi (F41): thưởng ngay là
    // trả tiền cho việc bấm nút, và hàng đợi sẽ ngập báo xấu vu vơ. Chỉ
    // RESOLVED mới là "đúng"; DISMISSED là Admin đã bác.
    if (command.review.status === ReportStatuses.RESOLVED)
      await this.awardReporter(existing.reporterUserId, command.reportId);

    await this.announceOutcome(existing, command.review.status, note);

    const report = await this.reports.findAdminByGlobalId(command.reportId);
    if (!report) throw new ReportNotFoundException();
    return { report };
  }

  /**
   * Báo cho hai bên sau khi Admin kết luận.
   *
   * Không báo thì người gửi không biết mình đúng hay sai — và không hiểu vì sao
   * tự nhiên được cộng 5 điểm; còn người bị xử lý thấy bài mình biến mất mà
   * không ai nói vì sao, nên họ sẽ tái phạm hoặc nghĩ là lỗi hệ thống.
   *
   * KHÔNG ném: Admin đã kết luận và kết luận đó đã ghi. Một thông báo gửi lỗi
   * không được làm hỏng việc đó.
   */
  private async announceOutcome(
    report: {
      reporterUserId: string;
      targetType: ReportTargetTypes;
      targetId: string;
    },
    status: ReportStatuses,
    note: string,
  ): Promise<void> {
    const upheld = status === ReportStatuses.RESOLVED;

    try {
      await this.dispatchNotification.handle({
        userId: report.reporterUserId,
        type: NotificationTypes.REPORT_REVIEWED,
        title: 'Báo xấu của bạn đã được xem xét',
        body: `Kết luận: ${upheld ? 'đã xác minh và xử lý' : 'không vi phạm'}. Cảm ơn bạn đã báo.`,
        referenceType: 'REPORT',
        referenceId: report.targetId,
        idempotencyKey: `REPORT_REVIEWED:${report.targetId}:${report.reporterUserId}:${status}`,
        variables: {
          outcome: upheld ? 'đã xác minh và xử lý' : 'không vi phạm',
        },
      });

      // Chỉ báo cho người bị xử lý khi báo xấu được XÁC MINH. Báo xấu bị bác thì
      // họ chưa làm gì sai, và nói "có người báo bạn" là mời một cuộc cãi vã.
      if (!upheld) return;

      const ownerId = await this.reports.findTargetOwner(
        report.targetType,
        report.targetId,
      );
      // Không tự báo chính mình, và bỏ qua nếu nội dung đã biến mất.
      if (!ownerId || ownerId === report.reporterUserId) return;

      await this.dispatchNotification.handle({
        userId: ownerId,
        type: NotificationTypes.CONTENT_MODERATED,
        title: 'Nội dung của bạn đã bị xử lý',
        body: `Một nội dung của bạn bị xử lý sau khi được xem xét. Lý do: ${note}`,
        referenceType: report.targetType,
        referenceId: report.targetId,
        idempotencyKey: `CONTENT_MODERATED:${report.targetType}:${report.targetId}`,
        variables: { action: 'xử lý', reason: note },
      });
    } catch {
      // Cố ý im lặng — xem ghi chú trên.
    }
  }

  /**
   * Điểm không được làm hỏng việc kết luận báo xấu.
   *
   * Admin đã xem xét và quyết định là một SỰ THẬT; thưởng bao nhiêu là CHÍNH
   * SÁCH. Rule này seed TẮT sẵn nên đây là đường chạy mặc định cho tới khi
   * Admin bật — ném ra ngoài là Admin không kết luận được báo xấu nào.
   */
  private async awardReporter(
    reporterUserId: string,
    reportId: string,
  ): Promise<void> {
    try {
      await this.points.handle({
        userId: reporterUserId,
        ruleCode: ReportUpheldRuleCode,
        referenceType: 'REPORT',
        referenceId: reportId,
        idempotencyKey: `${ReportUpheldRuleCode}:${reportId}`,
        actor: 'SYSTEM',
        source: 'REPORT',
      });
    } catch (error) {
      const isPolicy = isPointPolicyError(error);
      if (!isPolicy) throw error;
    }
  }
}

/**
 * Ai đang báo bừa.
 *
 * **Không tự động phạt, y như cờ Giver Accuracy.** Danh sách này chỉ đưa hồ sơ lên
 * bàn Admin; mọi chế tài vẫn là quyết định của người thật. Một người báo sai nhiều
 * có thể là người hiểu sai luật chứ không phải người xấu, và phân biệt hai cái là
 * việc của con người.
 *
 * Trả kèm ngưỡng đang áp để Admin đọc được con số `abusive` dựa trên đâu — không
 * thì nó là một dấu đỏ không ai giải thích được.
 */
@Injectable()
export class ListReporterStatsUseCase implements IListReporterStatsUseCase {
  public constructor(
    @Inject(IReportRepository) private readonly reports: IReportRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListReporterStatsCommand,
  ): Promise<IListReporterStatsResult> {
    const config = normalizeReportAbuseConfig(
      await this.adminConfig.getConfigValue(ReportAbuseConfigKey),
    );

    return {
      reporters: await this.reports.findReporterStats({
        // Mặc định CHỈ người đã vượt ngưỡng: mở màn hình ra để thấy mọi người
        // từng báo xấu thì không ai đọc hết, và cái cần xem sẽ nằm lẫn trong đó.
        abusiveOnly: command.abusiveOnly !== false,
        limit: command.limit ?? 100,
      }),
      minReports: config.minReports,
      dismissedRatioPercent: config.dismissedRatioPercent,
    };
  }
}
