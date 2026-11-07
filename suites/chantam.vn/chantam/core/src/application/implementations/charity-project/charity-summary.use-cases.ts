import {
  ICharityEvaluationBoard,
  ICharityProjectCommand,
  ICharitySummaryBoard,
  IEvaluateCharityParticipantCommand,
  IEvaluateCharityParticipantUseCase,
  IGetCharityPromotionUseCase,
  IGetCharitySummaryUseCase,
  IGetMyCharityEvaluationUseCase,
  IListCharityEvaluationsUseCase,
  IListCharityHomeCardsUseCase,
  IMyCharityEvaluation,
  IPublishCharitySummaryUseCase,
  IRequestCharityPromotionCommand,
  IRequestCharityPromotionUseCase,
  ISaveCharityFinancialReportCommand,
  ISaveCharityFinancialReportUseCase,
  ISaveCharitySummaryCommand,
  ISaveCharitySummaryUseCase,
  ISetCharityPromotionCommand,
  ISetCharityPromotionUseCase,
  ISetCharityPublicNameCommand,
  ISetCharityPublicNameUseCase,
} from '@/application/contracts/charity-project';
import {
  CharityCampaignNotFoundException,
  CharityContributionNotFoundException,
  CharityEvaluationTargetInvalidException,
  CharityFinancialReportNotFoundException,
  CharityNotRegisteredException,
  CharityProjectCompletionBlockedException,
  CharityProjectForbiddenException,
  CharityProjectNotApprovedException,
  CharitySummaryEmptyException,
  CharitySummaryFinancialRequiredException,
  CharitySummaryNotOpenException,
} from '@/domain/exceptions';
import { ICharityRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityOperationsRepository,
  ICharityProjectRepository,
  ICharitySummary,
  ICharitySummaryContent,
  ICharitySummaryRepository,
} from '@/domain/ports/repository';
import {
  CharityCompletionBlockerLabels,
  CharityFeaturedCtas,
  stageRank,
  summaryNeedsFinancialReport,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { CharityPointsService } from './charity-points.service';
import { CharityProjectAccess } from './charity-project.use-cases';

const WritePermission = 'campaign.manage';
const UrlPattern = /^https:\/\/\S+$/;

const trimmed = (value: string | null | undefined): string | null =>
  value?.trim() || null;

function assertSummaryOpen(campaign: ICharityCampaign): void {
  if (campaign.approvalStatus !== 'APPROVED')
    throw new CharityProjectNotApprovedException();
  if (stageRank(campaign.operationStage) < stageRank('SUMMARY'))
    throw new CharitySummaryNotOpenException();
}

function urlErrors(field: string, urls: readonly string[]): string[] {
  return urls
    .map((url, index) =>
      UrlPattern.test(url) ? null : `${field}[${index}]: phải là URL https`,
    )
    .filter((error): error is string => error !== null);
}

// ── Tổng kết ────────────────────────────────────────────────────────────────

@Injectable()
export class GetCharitySummaryUseCase implements IGetCharitySummaryUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharitySummaryBoard> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const [summary, financialReports, funding] = await Promise.all([
      this.summaries.getSummary(campaign.globalId),
      this.summaries.listFinancialReports(campaign.globalId),
      this.projects.listFundingNeeds(campaign.globalId),
    ]);
    return {
      summary,
      financialReports,
      financialReportRequired: summaryNeedsFinancialReport(funding),
    };
  }
}

@Injectable()
export class SaveCharitySummaryUseCase implements ISaveCharitySummaryUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
  ) {}

  public async handle(
    command: ISaveCharitySummaryCommand,
  ): Promise<ICharitySummary> {
    const { campaign } = await this.access.forEdit(command);
    assertSummaryOpen(campaign);
    const errors = urlErrors(
      'summary.evidenceUrls',
      command.content.evidenceUrls,
    );
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const content: ICharitySummaryContent = {
      summary: trimmed(command.content.summary),
      usageReport: trimmed(command.content.usageReport),
      thanksMessage: trimmed(command.content.thanksMessage),
      lessonsLearned: trimmed(command.content.lessonsLearned),
      evidenceUrls: command.content.evidenceUrls,
    };
    const saved = await this.summaries.saveSummary({
      campaignId: campaign.globalId,
      actorId: command.userId,
      content,
    });
    // Bản đã công khai vừa đổi: người xem cần tải lại.
    if (saved.publishedAt)
      this.realtime.signal(campaign.globalId, ['SUMMARY'], 'public');
    return saved;
  }
}

/**
 * Công khai tổng kết (§3.6). Dự án có nhận tiền mà chưa có báo cáo tài chính (kèm sao kê) thì
 * KHÔNG công khai được — tổng kết tài chính thiếu sao kê là lời hứa không kiểm chứng được.
 */
@Injectable()
export class PublishCharitySummaryUseCase implements IPublishCharitySummaryUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
    @Optional()
    @Inject(ICharityOperationsRepository)
    private readonly operations?: ICharityOperationsRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharitySummary> {
    const { campaign } = await this.access.forEdit(command);
    assertSummaryOpen(campaign);
    const [summary, reports, funding] = await Promise.all([
      this.summaries.getSummary(campaign.globalId),
      this.summaries.listFinancialReports(campaign.globalId),
      this.projects.listFundingNeeds(campaign.globalId),
    ]);
    if (
      !summary ||
      (!summary.summary && !summary.usageReport && !summary.thanksMessage)
    )
      throw new CharitySummaryEmptyException();
    if (summaryNeedsFinancialReport(funding) && reports.length === 0)
      throw new CharitySummaryFinancialRequiredException();
    // Công khai tổng kết là hoàn tất dự án (§3.18): còn đề nghị chưa xử lý, giao nhận chưa
    // đối soát, hạng mục mở, phần dư chưa giải trình, khiếu nại mở… thì chưa được.
    const blockers =
      (await this.operations?.completionBlockers(campaign.globalId)) ?? [];
    if (blockers.length > 0)
      throw new CharityProjectCompletionBlockedException(
        blockers.map((code) => CharityCompletionBlockerLabels[code]).join(', '),
      );
    const published = await this.summaries.publishSummary({
      campaignId: campaign.globalId,
      actorId: command.userId,
    });
    if (!published) throw new CharitySummaryEmptyException();
    this.realtime.signal(campaign.globalId, ['SUMMARY'], 'public');
    return published;
  }
}

@Injectable()
export class SaveCharityFinancialReportUseCase implements ISaveCharityFinancialReportUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Inject(ICharityRealtimePublisher)
    private readonly realtime: ICharityRealtimePublisher,
  ) {}

  public async handle(command: ISaveCharityFinancialReportCommand) {
    const { campaign } = await this.access.forEdit(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    const report = {
      ...command.report,
      explanation: command.report.explanation.trim(),
    };
    const errors = urlErrors('report.statementUrls', report.statementUrls);
    if (report.statementUrls.length === 0)
      errors.push('report.statementUrls: cần ít nhất một sao kê / bằng chứng');
    if (report.periodFrom > report.periodTo)
      errors.push('report.periodTo: phải sau hoặc bằng periodFrom');
    if (!report.explanation) errors.push('report.explanation: bắt buộc');
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const saved = command.reportId
      ? await this.summaries.updateFinancialReport({
          campaignId: campaign.globalId,
          reportId: command.reportId,
          actorId: command.userId,
          report,
        })
      : await this.summaries.createFinancialReport({
          campaignId: campaign.globalId,
          actorId: command.userId,
          report,
        });
    if (!saved) throw new CharityFinancialReportNotFoundException();
    this.realtime.signal(campaign.globalId, ['SUMMARY'], 'workspace');
    return saved;
  }
}

// ── Chấm mức hoàn thành ─────────────────────────────────────────────────────

/** Nội bộ: người tạo, coordinator, Admin `campaign.read`. */
@Injectable()
export class ListCharityEvaluationsUseCase implements IListCharityEvaluationsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityEvaluationBoard> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const [evaluations, candidates] = await Promise.all([
      this.summaries.listLatestEvaluations(campaign.globalId),
      this.summaries.listEvaluationCandidates(campaign.globalId),
    ]);
    return { evaluations, candidates };
  }
}

/**
 * Chấm mức hoàn thành 0–100 (§3.6): ban tổ chức/coordinator, chỉ ở Tổng kết, chỉ người tham
 * gia. Chấm lại = lần chấm mới (giữ lịch sử).
 */
@Injectable()
export class EvaluateCharityParticipantUseCase implements IEvaluateCharityParticipantUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    // Tuỳ chọn để spec dựng tay không phải đổi; Nest luôn tiêm (§3.9).
    @Optional()
    private readonly points?: CharityPointsService,
  ) {}

  public async handle(command: IEvaluateCharityParticipantCommand) {
    const { campaign } = await this.access.forOperate(command);
    assertSummaryOpen(campaign);
    if (
      !Number.isInteger(command.completionScore) ||
      command.completionScore < 0 ||
      command.completionScore > 100
    )
      throw new ValidationFailedException([
        'evaluation.completionScore: số nguyên 0–100',
      ]);
    if (
      !(await this.summaries.isEvaluationCandidate(
        campaign.globalId,
        command.participantId,
      ))
    )
      throw new CharityEvaluationTargetInvalidException();
    const evaluation = await this.summaries.addEvaluation({
      campaignId: campaign.globalId,
      participantId: command.participantId,
      completionScore: command.completionScore,
      note: trimmed(command.note),
      evaluatedBy: command.userId,
      source: 'ORGANIZER',
    });
    await this.points?.awardParticipation({
      campaignId: campaign.globalId,
      participantId: command.participantId,
      completionScore: evaluation.completionScore,
    });
    return evaluation;
  }
}

@Injectable()
export class GetMyCharityEvaluationUseCase implements IGetMyCharityEvaluationUseCase {
  public constructor(
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<IMyCharityEvaluation | null> {
    const latest = await this.summaries.latestEvaluation(
      command.campaignId,
      command.userId,
    );
    return latest
      ? {
          evaluationId: latest.evaluationId,
          completionScore: latest.completionScore,
          createdAt: latest.createdAt,
          version: latest.version,
        }
      : null;
  }
}

// ── Nickname công khai ──────────────────────────────────────────────────────

@Injectable()
export class SetCharityPublicNameUseCase implements ISetCharityPublicNameUseCase {
  public constructor(
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(
    command: ISetCharityPublicNameCommand,
  ): Promise<{ updated: true }> {
    if (command.contributionId) {
      const updated = await this.summaries.setContributionPublicName({
        campaignId: command.campaignId,
        contributionId: command.contributionId,
        userId: command.userId,
        show: command.show,
      });
      if (!updated) throw new CharityContributionNotFoundException();
    } else {
      const updated = await this.summaries.setParticipationPublicName({
        campaignId: command.campaignId,
        userId: command.userId,
        show: command.show,
      });
      if (!updated) throw new CharityNotRegisteredException();
    }
    return { updated: true };
  }
}

// ── Card Home ───────────────────────────────────────────────────────────────

@Injectable()
export class RequestCharityPromotionUseCase implements IRequestCharityPromotionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(command: IRequestCharityPromotionCommand) {
    const { campaign } = await this.access.forEdit(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    await this.summaries.requestPromotion({
      campaignId: campaign.globalId,
      note: trimmed(command.note),
    });
    return (await this.summaries.getPromotion(campaign.globalId))!;
  }
}

/** Chỉ Admin `campaign.manage` bật/tắt card Home (§3.14) — có lý do và audit. */
@Injectable()
export class SetCharityPromotionUseCase implements ISetCharityPromotionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(command: ISetCharityPromotionCommand) {
    if (!(await this.admin.hasPermission(command.userId, WritePermission)))
      throw new CharityProjectForbiddenException();
    const promotion = {
      ...command.promotion,
      featuredTitle: trimmed(command.promotion.featuredTitle),
      featuredMessage: trimmed(command.promotion.featuredMessage),
    };
    const errors: string[] = [];
    if (
      promotion.featuredOnHome &&
      (!promotion.featuredTitle || !promotion.featuredCta)
    )
      errors.push('promotion: bật card Home cần featuredTitle và featuredCta');
    if (
      promotion.featuredCta &&
      !CharityFeaturedCtas.includes(promotion.featuredCta)
    )
      errors.push('promotion.featuredCta: không hợp lệ');
    if (
      promotion.featuredMediaUrl &&
      !UrlPattern.test(promotion.featuredMediaUrl)
    )
      errors.push('promotion.featuredMediaUrl: phải là URL https');
    if (
      promotion.featuredFrom &&
      promotion.featuredUntil &&
      promotion.featuredFrom >= promotion.featuredUntil
    )
      errors.push('promotion.featuredUntil: phải sau featuredFrom');
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const saved = await this.summaries.setPromotion({
      campaignId: command.campaignId,
      actorId: command.userId,
      reason: command.reason.trim(),
      promotion,
    });
    if (!saved) throw new CharityCampaignNotFoundException();
    return saved;
  }
}

@Injectable()
export class GetCharityPromotionUseCase implements IGetCharityPromotionUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    if (!(await this.admin.hasPermission(command.userId, 'campaign.read')))
      throw new CharityProjectForbiddenException();
    const promotion = await this.summaries.getPromotion(command.campaignId);
    if (!promotion) throw new CharityCampaignNotFoundException();
    return promotion;
  }
}

@Injectable()
export class ListCharityHomeCardsUseCase implements IListCharityHomeCardsUseCase {
  public constructor(
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
  ) {}

  public async handle(command: { limit: number }) {
    return this.summaries.listHomeCards(
      Math.min(Math.max(command.limit, 1), 20),
    );
  }
}
