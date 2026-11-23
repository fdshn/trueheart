import {
  ICharityCompletionCheck,
  ICharityProjectCommand,
  ICharitySupportNeedPublic,
  ICheckCharityCompletionUseCase,
  IDecideCharitySupportOfferCommand,
  IDecideCharitySupportOfferUseCase,
  IDeleteCharitySupportNeedCommand,
  IDeleteCharitySupportNeedUseCase,
  IGetCharityDistributionUseCase,
  IListCharitySupportNeedsUseCase,
  IListCharitySupportOffersCommand,
  IListCharitySupportOffersUseCase,
  IManageCharitySupportNeedsUseCase,
  IOfferCharitySupportCommand,
  IOfferCharitySupportUseCase,
  IPostponeCharityDistributionCommand,
  IPostponeCharityDistributionUseCase,
  ISaveCharityDistributionCommand,
  ISaveCharityDistributionEvidenceCommand,
  ISaveCharityDistributionEvidenceUseCase,
  ISaveCharityDistributionUseCase,
  ISaveCharitySupportNeedCommand,
  ISaveCharitySupportNeedUseCase,
  IWithdrawCharitySupportOfferCommand,
  IWithdrawCharitySupportOfferUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  assertContributionTypeAccepted,
  assertDistributionMethodAcceptedByCampaign,
} from '@/domain/charity-contribution-type';
import {
  CharityBeneficiaryDistributionTimeOutOfRangeException,
  CharityCampaignNotFoundException,
  CharityIntakeClosedException,
  CharityProjectNotApprovedException,
  CharityStageTransitionInvalidException,
  CharitySupportNeedClosedException,
  CharitySupportNeedInUseException,
  CharitySupportNeedNotFoundException,
  CharitySupportOfferInvalidStateException,
  CharitySupportOfferNotFoundException,
} from '@/domain/exceptions';
import {
  ICharityCampaignRepository,
  ICharityOperationsRepository,
  ICharityProjectRepository,
  ICharitySupportNeed,
  ICharitySupportNeedExternal,
  ICharitySupportOffer,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  beneficiariesOutsideWindow,
  CharityCompletionBlockerLabels,
  CharitySupportOfferDecisionRules,
  CharitySupportOfferStatus,
  CharitySupportOfferWithdrawableStatuses,
  isIntakeClosed,
  isPubliclyVisibleProject,
  MaxCharityDistributionEvidenceUrls,
  phaseScheduleGaps,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { prepareCharityCampaignDistribution } from './charity-campaign-distribution';
import { CharityProjectAccess } from './charity-project.use-cases';

const trimmed = (value: string | null | undefined): string | null =>
  value?.trim() || null;

const isHttpsUrl = (value: string): boolean => /^https:\/\/\S+$/.test(value);

/** Tài khoản thụ hưởng ĐANG hiệu lực của chính dự án này (danh sách đã lọc theo dự án). */
async function findLiveBeneficiaryAccount(
  projects: ICharityProjectRepository,
  campaignId: string,
  accountId: string,
) {
  return (
    (await projects.listBeneficiaryBankAccounts(campaignId)).find(
      (row) => row.accountId === accountId && row.validTo === null,
    ) ?? null
  );
}

const toSupportPublic = ({
  picPhone: _phone,
  ...need
}: ICharitySupportNeed): ICharitySupportNeedPublic => need;

const OfferLabels: Readonly<Record<CharitySupportOfferStatus, string>> = {
  PENDING: 'đang chờ ban tổ chức xét',
  ACCEPTED: 'đã được ban tổ chức nhận',
  REJECTED: 'chưa được nhận lần này',
  COMPLETED: 'đã được ghi nhận hoàn thành',
  WITHDRAWN: 'đã rút lại',
};

/** Báo người hỗ trợ khi ban tổ chức xét đề nghị. Lỗi gửi không chặn. */
@Injectable()
export class CharitySupportOfferNotifier {
  private readonly logger = new Logger(CharitySupportOfferNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async notify(
    offer: ICharitySupportOffer,
    campaignTitle: string,
  ): Promise<void> {
    const reason = offer.decisionReason
      ? ` Lý do: ${offer.decisionReason}`
      : '';
    try {
      await this.dispatch.handle({
        userId: offer.user.userId,
        type: NotificationTypes.CHARITY_SUPPORT_OFFER_UPDATED,
        title: 'Cập nhật đề nghị hỗ trợ',
        body: `Đề nghị hỗ trợ của bạn ở dự án "${campaignTitle}" ${OfferLabels[offer.status]}.${reason}`,
        referenceType: 'CHARITY_SUPPORT_OFFER',
        referenceId: offer.offerId,
        target: {
          type: NotificationTargetTypes.CHARITY_CAMPAIGN,
          id: offer.campaignId,
        },
        idempotencyKey: `CHARITY_SUPPORT_OFFER_UPDATED:${offer.offerId}:${offer.status}`,
      });
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo đề nghị hỗ trợ ${offer.offerId}: ${String(error)}`,
      );
    }
  }
}

// ── Hỗ trợ mở ───────────────────────────────────────────────────────────────

@Injectable()
export class ListCharitySupportNeedsUseCase implements IListCharitySupportNeedsUseCase {
  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: { idOrSlug: string }) {
    const id = await this.projects.findVisibleCampaignId(command.idOrSlug);
    if (!id) throw new CharityCampaignNotFoundException();
    return (await this.operations.listSupportNeeds(id)).map(toSupportPublic);
  }
}

@Injectable()
export class ManageCharitySupportNeedsUseCase implements IManageCharitySupportNeedsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    return this.operations.listSupportNeeds(campaign.globalId);
  }
}

@Injectable()
export class SaveCharitySupportNeedUseCase implements ISaveCharitySupportNeedUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: ISaveCharitySupportNeedCommand) {
    const { campaign } = await this.access.forEdit(command);
    const need = {
      ...command.need,
      title: command.need.title.trim(),
      unit: command.need.unit.trim(),
      description: trimmed(command.need.description),
      locationLabel: trimmed(command.need.locationLabel),
      requirements: trimmed(command.need.requirements),
      handoverMethod: trimmed(command.need.handoverMethod),
      picName: trimmed(command.need.picName),
      picPhone: trimmed(command.need.picPhone),
    };
    const errors: string[] = [];
    if (!need.title) errors.push('supportNeed.title: bắt buộc');
    if (!need.unit) errors.push('supportNeed.unit: bắt buộc');
    if (need.startsAt && need.endsAt && need.endsAt <= need.startsAt)
      errors.push('supportNeed.endsAt: phải sau startsAt');
    const external = command.external;
    if (external) {
      if (external.quantity > 0 && external.evidenceUrls.length === 0)
        errors.push(
          'supportNeed.external.evidenceUrls: nguồn ngoài app phải có bằng chứng',
        );
      if (external.evidenceUrls.some((url) => !isHttpsUrl(url)))
        errors.push('supportNeed.external.evidenceUrls: phải là https://');
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);

    if (!command.supportNeedId)
      return this.operations.createSupportNeed({
        campaignId: campaign.globalId,
        actorId: command.userId,
        need,
      });
    const current = await this.operations.findSupportNeed(
      campaign.globalId,
      command.supportNeedId,
    );
    if (!current) throw new CharitySupportNeedNotFoundException();
    const nextExternal: ICharitySupportNeedExternal = external
      ? { ...external, note: trimmed(external.note) }
      : current.external;
    const updated = await this.operations.updateSupportNeed({
      campaignId: campaign.globalId,
      supportNeedId: command.supportNeedId,
      actorId: command.userId,
      need,
      external: nextExternal,
      status: command.status ?? current.status,
    });
    if (!updated) throw new CharitySupportNeedNotFoundException();
    return updated;
  }
}

/** Xoá chỉ khi chưa ai nhận hỗ trợ; có rồi thì đóng (§3.18 — không xoá cứng). */
@Injectable()
export class DeleteCharitySupportNeedUseCase implements IDeleteCharitySupportNeedUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: IDeleteCharitySupportNeedCommand) {
    const { campaign } = await this.access.forEdit(command);
    const outcome = await this.operations.deleteSupportNeed(
      campaign.globalId,
      command.supportNeedId,
    );
    if (outcome === 'NOT_FOUND')
      throw new CharitySupportNeedNotFoundException();
    if (outcome === 'HAS_OFFERS') throw new CharitySupportNeedInUseException();
    return { deleted: true as const };
  }
}

/** Nhận hỗ trợ một phần, nhiều lần được; không cần đóng góp hay tham gia trước (§3.11). */
@Injectable()
export class OfferCharitySupportUseCase implements IOfferCharitySupportUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: IOfferCharitySupportCommand) {
    if (!Number.isInteger(command.quantity) || command.quantity < 1)
      throw new ValidationFailedException(['offer.quantity: tối thiểu 1']);
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
      throw new CharityCampaignNotFoundException();
    if (!campaign.isActive || campaign.operationStage === 'SUMMARY')
      throw new CharitySupportNeedClosedException();
    assertContributionTypeAccepted(campaign, 'SERVICE');
    // Hết tiếp nhận (CR 22/11/2026 §3.9) chặn nhận hỗ trợ mới; rút lượt đã nhận vẫn được.
    if (isIntakeClosed(campaign, new Date()))
      throw new CharityIntakeClosedException();
    const need = await this.operations.findSupportNeed(
      campaign.globalId,
      command.supportNeedId,
    );
    if (!need) throw new CharitySupportNeedNotFoundException();
    if (need.status !== 'OPEN') throw new CharitySupportNeedClosedException();
    return this.operations.createOffer({
      supportNeedId: need.supportNeedId,
      userId: command.userId,
      quantity: command.quantity,
      note: trimmed(command.note),
    });
  }
}

@Injectable()
export class ListCharitySupportOffersUseCase implements IListCharitySupportOffersUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: IListCharitySupportOffersCommand) {
    if (command.mine) {
      const campaign = await this.campaigns.findByGlobalId(command.campaignId);
      if (!campaign) throw new CharityCampaignNotFoundException();
      return this.operations.listOffers({
        campaignId: campaign.globalId,
        supportNeedId: command.supportNeedId,
        userId: command.userId,
      });
    }
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    return this.operations.listOffers({
      campaignId: campaign.globalId,
      supportNeedId: command.supportNeedId,
      userId: null,
    });
  }
}

/** Ban tổ chức nhận / từ chối (có lý do) / ghi hoàn thành (một phần được). */
@Injectable()
export class DecideCharitySupportOfferUseCase implements IDecideCharitySupportOfferUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
    private readonly notifier: CharitySupportOfferNotifier,
  ) {}

  public async handle(command: IDecideCharitySupportOfferCommand) {
    const reason = trimmed(command.reason);
    if (command.action === 'REJECT' && !reason)
      throw new ValidationFailedException(['decision.reason: bắt buộc']);
    const { campaign } = await this.access.forOperate(command);
    const current = await this.operations.findOffer(
      campaign.globalId,
      command.offerId,
    );
    if (!current) throw new CharitySupportOfferNotFoundException();
    const rule = CharitySupportOfferDecisionRules[command.action];
    if (!rule.from.includes(current.status))
      throw new CharitySupportOfferInvalidStateException(current.status);
    let completedQuantity: number | null = null;
    if (command.action === 'COMPLETE') {
      completedQuantity = command.completedQuantity ?? current.quantity;
      if (
        !Number.isInteger(completedQuantity) ||
        completedQuantity < 0 ||
        completedQuantity > current.quantity
      )
        throw new ValidationFailedException([
          `decision.completedQuantity: từ 0 tới ${current.quantity}`,
        ]);
    }
    const updated = await this.operations.transitionOffer({
      campaignId: campaign.globalId,
      offerId: current.offerId,
      from: rule.from,
      to: rule.to,
      actorId: command.userId,
      reason,
      completedQuantity,
    });
    if (!updated) {
      const latest = await this.operations.findOffer(
        campaign.globalId,
        command.offerId,
      );
      throw new CharitySupportOfferInvalidStateException(
        latest?.status ?? current.status,
      );
    }
    await this.notifier.notify(updated, campaign.title);
    return updated;
  }
}

@Injectable()
export class WithdrawCharitySupportOfferUseCase implements IWithdrawCharitySupportOfferUseCase {
  public constructor(
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: IWithdrawCharitySupportOfferCommand) {
    const current = await this.operations.findOffer(
      command.campaignId,
      command.offerId,
    );
    // Đề nghị của người khác: 404 như không có.
    if (!current || current.user.userId !== command.userId)
      throw new CharitySupportOfferNotFoundException();
    if (!CharitySupportOfferWithdrawableStatuses.includes(current.status))
      throw new CharitySupportOfferInvalidStateException(current.status);
    const updated = await this.operations.transitionOffer({
      campaignId: command.campaignId,
      offerId: command.offerId,
      from: CharitySupportOfferWithdrawableStatuses,
      to: 'WITHDRAWN',
      actorId: command.userId,
      reason: null,
      completedQuantity: null,
    });
    if (!updated)
      throw new CharitySupportOfferInvalidStateException('WITHDRAWN');
    return updated;
  }
}

// ── Hoãn bước trao (§3.2) ──────────────────────────────────────────────────

/**
 * Owner/BTC hoãn mốc trao, bắt buộc lý do. Ghi lịch sử sửa (kèm lý do) và báo người đã ủng
 * hộ/tham gia qua thông báo "kế hoạch thay đổi"; nhắc 48 giờ tự xếp lại cho mốc mới.
 */
@Injectable()
export class PostponeCharityDistributionUseCase implements IPostponeCharityDistributionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IPostponeCharityDistributionCommand) {
    const reason = trimmed(command.reason);
    if (!reason)
      throw new ValidationFailedException(['postpone.reason: bắt buộc']);
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    if (
      campaign.operationStage !== 'PLAN' &&
      campaign.operationStage !== 'EXECUTION'
    )
      throw new CharityStageTransitionInvalidException(
        'chỉ hoãn được trước khi bước trao bắt đầu — lùi giai đoạn trước',
      );
    const phases = await this.projects.listPhases(campaign.globalId);
    const distribution = phases.find((phase) => phase.phase === 'DISTRIBUTION');
    if (!distribution)
      throw new ValidationFailedException([
        'phases: chưa có bước DISTRIBUTION để hoãn',
      ]);
    const now = Date.now();
    if (
      command.startsAt.getTime() <= distribution.startsAt.getTime() ||
      command.startsAt.getTime() <= now
    )
      throw new ValidationFailedException([
        'postpone.startsAt: phải sau mốc trao hiện tại và sau lúc này',
      ]);
    const endsAt =
      command.endsAt ??
      new Date(
        command.startsAt.getTime() +
          (distribution.endsAt.getTime() - distribution.startsAt.getTime()),
      );
    const next = phases.map((phase) =>
      phase.phase === 'DISTRIBUTION'
        ? { ...phase, startsAt: command.startsAt, endsAt }
        : phase,
    );
    const errors = phaseScheduleGaps(next);
    if (errors.length > 0) throw new ValidationFailedException(errors);
    // Hoãn làm đơn vị nhận rơi ra ngoài khung trao mới → phải dời giờ trao của họ trước.
    const outside = beneficiariesOutsideWindow(
      (await this.projects.listParties(campaign.globalId))
        .filter(
          (party) => party.role === 'BENEFICIARY' && !party.isAppealSubject,
        )
        .map((party) => ({
          name: party.name,
          distributionAt: party.distributionAt ?? null,
        })),
      { startsAt: command.startsAt, endsAt },
    );
    if (outside.length > 0)
      throw new CharityBeneficiaryDistributionTimeOutOfRangeException(
        outside.map((row) => ({
          index: row.index,
          name: row.name,
          distributionAt: row.distributionAt.toISOString(),
        })),
      );
    return this.projects.replacePhases({
      campaignId: campaign.globalId,
      actorId: command.userId,
      phases: next,
      reason,
    });
  }
}

// ── Hình thức trao cấp chiến dịch (CR 22/11/2026) ──────────────────────────

/** Workspace: hình thức trao kèm chi tiết riêng tư — chỉ người vận hành dự án. */
@Injectable()
export class GetCharityDistributionUseCase implements IGetCharityDistributionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.forOperate(command);
    return this.operations.getDistribution(campaign.globalId);
  }
}

@Injectable()
export class SaveCharityDistributionUseCase implements ISaveCharityDistributionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ISaveCharityDistributionCommand) {
    const { campaign } = await this.access.forEdit(command);
    assertDistributionMethodAcceptedByCampaign(
      campaign,
      command.distribution.distributionMethod,
    );
    const distribution = prepareCharityCampaignDistribution(
      command.distribution,
    );
    const accountId = distribution.privateDetails.beneficiaryBankAccountId;
    if (
      accountId &&
      !(await findLiveBeneficiaryAccount(
        this.projects,
        campaign.globalId,
        accountId,
      ))
    )
      throw new ValidationFailedException([
        'distribution.beneficiaryBankAccountId: phải là tài khoản thụ hưởng đang hiệu lực của chiến dịch này',
      ]);
    return this.operations.saveDistribution({
      campaignId: campaign.globalId,
      actorId: command.userId,
      distribution,
    });
  }
}

/** Ảnh bằng chứng trao (công khai): https, không trùng, tối đa 20. */
@Injectable()
export class SaveCharityDistributionEvidenceUseCase implements ISaveCharityDistributionEvidenceUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(command: ISaveCharityDistributionEvidenceCommand) {
    const { campaign } = await this.access.forOperate(command);
    const urls = command.evidenceUrls.map((url) => url.trim());
    if (
      urls.length > MaxCharityDistributionEvidenceUrls ||
      urls.some((url) => !isHttpsUrl(url)) ||
      new Set(urls).size !== urls.length
    )
      throw new ValidationFailedException([
        'evidence.urls: https://, không trùng, tối đa 20',
      ]);
    return this.operations.saveDistributionEvidence({
      campaignId: campaign.globalId,
      actorId: command.userId,
      evidenceUrls: urls,
    });
  }
}

// ── Hoàn tất dự án (§3.18) ──────────────────────────────────────────────────

@Injectable()
export class CheckCharityCompletionUseCase implements ICheckCharityCompletionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityOperationsRepository)
    private readonly operations: ICharityOperationsRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityCompletionCheck> {
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const blockers = await this.operations.completionBlockers(
      campaign.globalId,
    );
    return {
      canComplete: blockers.length === 0,
      blockers: blockers.map((code) => ({
        code,
        label: CharityCompletionBlockerLabels[code],
      })),
    };
  }
}
