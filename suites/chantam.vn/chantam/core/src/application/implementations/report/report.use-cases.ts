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
  IReviewReportCommand,
  IReviewReportResult,
  IReviewReportUseCase,
} from '@/application/contracts/report';
import {
  ContentCommentNotFoundException,
  PointDailyCapReachedException,
  PointRuleUnavailableException,
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
import {
  ReportStatuses,
  ReportTargetTypes,
  ReportUpheldRuleCode,
} from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

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

    const report = await this.reports.findAdminByGlobalId(command.reportId);
    if (!report) throw new ReportNotFoundException();
    return { report };
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
      const isPolicy =
        error instanceof PointDailyCapReachedException ||
        error instanceof PointRuleUnavailableException;
      if (!isPolicy) throw error;
    }
  }
}
