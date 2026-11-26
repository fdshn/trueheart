import { ICharityCampaignView } from '@/application/contracts/charity-campaign';
import {
  IAddCharityBankAccountCommand,
  IAddCharityBankAccountUseCase,
  IAddCharityBeneficiaryBankAccountCommand,
  IAddCharityBeneficiaryBankAccountUseCase,
  IAdminCharityChangeRequestCommand,
  IAdvanceCharityStagesUseCase,
  ICancelCharityVolunteerUseCase,
  ICharityProjectCommand,
  ICharityProjectSectionView,
  ICharityPublicProject,
  ICharitySectionCommand,
  ICharityVolunteerRegistrationCommand,
  ICharityWorkspace,
  ICloseCharityBankAccountCommand,
  ICloseCharityBankAccountUseCase,
  ICloseCharityBeneficiaryBankAccountCommand,
  ICloseCharityBeneficiaryBankAccountUseCase,
  IConfirmCharityVolunteerUseCase,
  IDecideCharityChangeRequestCommand,
  IDecideCharityChangeRequestUseCase,
  IGetAdminCharityChangeRequestUseCase,
  IGetCharityChangeRequestUseCase,
  IGetCharityPublicProjectCommand,
  IGetCharityPublicProjectUseCase,
  IGetCharityRehearsalUseCase,
  IGetCharityWorkspaceUseCase,
  IListCharityChangeRequestsCommand,
  IListCharityChangeRequestsUseCase,
  IMoveCharityStageCommand,
  IMoveCharityStageUseCase,
  IPublishCharitySectionUseCase,
  IRegisterCharityVolunteerUseCase,
  IReplaceCharityCustomSectionsCommand,
  IReplaceCharityCustomSectionsUseCase,
  IReplaceCharityIntakeLocationsCommand,
  IReplaceCharityIntakeLocationsUseCase,
  IReplaceCharityPartiesCommand,
  IReplaceCharityPartiesUseCase,
  IReplaceCharityPhasesCommand,
  IReplaceCharityPhasesUseCase,
  IReplaceCharityTeamCommand,
  IReplaceCharityTeamUseCase,
  ISaveCharityChangeRequestCommand,
  ISaveCharityChangeRequestUseCase,
  ISaveCharityFundingNeedCommand,
  ISaveCharityFundingNeedUseCase,
  ISaveCharityRehearsalCommand,
  ISaveCharityRehearsalUseCase,
  ISaveCharityScheduleCommand,
  ISaveCharityScheduleUseCase,
  ISaveCharitySectionUseCase,
  ISaveCharityVolunteerNeedCommand,
  ISaveCharityVolunteerNeedUseCase,
  ISetCharityLimitsCommand,
  ISetCharityLimitsUseCase,
  ISubmitCharityProjectUseCase,
  IUpdateCharityItemNeedCommand,
  IUpdateCharityItemNeedUseCase,
  IUpdateCharityProfileCommand,
  IUpdateCharityProfileUseCase,
  IVerifyCharityBeneficiaryBankAccountCommand,
  IVerifyCharityBeneficiaryBankAccountUseCase,
  IWithdrawCharityChangeRequestUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { assertContributionTypeAccepted } from '@/domain/charity-contribution-type';
import {
  CharityBankAccountLimitException,
  CharityBankAccountNotFoundException,
  CharityBeneficiaryAccountNameMismatchException,
  CharityBeneficiaryAccountNotVerifiedException,
  CharityBeneficiaryDistributionTimeOutOfRangeException,
  CharityCampaignNotFoundException,
  CharityChangeRequiresReviewException,
  CharityFundingNeedNotFoundException,
  CharityIntakeClosedException,
  CharityNeedItemInvalidException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  CharityProjectNotDraftException,
  CharityRehearsalNotReadyException,
  CharityRevisionPendingExistsException,
  CharityRoundEvidenceRequiredException,
  CharityScheduleInvalidException,
  CharitySectionEmptyException,
  CharityStageScheduleConflictException,
  CharityStageTransitionInvalidException,
  CharitySubmitRequirementsUnmetException,
  CharityVolunteerClosedException,
  CharityVolunteerNeedNotFoundException,
  CharityVolunteerRegistrationNotFoundException,
} from '@/domain/exceptions';
import { ICharityRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  ICharityChangeRequest,
  ICharityChangeRequestRepository,
  ICharityCustomSection,
  ICharityEngagementRepository,
  ICharityEventRepository,
  ICharityMoneyPledgeRepository,
  ICharityOperationsRepository,
  ICharityParty,
  ICharityPartyInput,
  ICharityProjectRepository,
  ICharitySummaryRepository,
  IEntitlementRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  beneficiariesOutsideWindow,
  beneficiarySubmitGaps,
  charityDistributionSettled,
  CharityEventStepLabels,
  CharityFieldVisibility,
  CharityMaxBankAccountsConfigKey,
  CharityMaxBeneficiariesConfigKey,
  CharityMaxIntakeLocationsConfigKey,
  CharityOperationStage,
  CharityOperationStageLabels,
  CharityOperationStages,
  CharityOrganizerReminderReason,
  CharityPointBonusPercents,
  charityScheduleGaps,
  CharitySectionCompletionStatus,
  charitySubmitRequirementGaps,
  CharityTaskLabels,
  defaultTaskSchedule,
  effectiveOperationStage,
  holderNameMatches,
  ICharityReviewedBeneficiary,
  ICharityReviewedFields,
  isCharityPointBonusPercent,
  isIntakeClosed,
  isPubliclyVisibleProject,
  isSuspendedProject,
  MaxPublicSupporterNames,
  normalizeContributionTypes,
  normalizeMaxBankAccounts,
  normalizeMaxBeneficiaries,
  normalizeMaxIntakeLocations,
  normalizeRehearsalChecklist,
  phaseScheduleGaps,
  reviewedFieldsChanged,
  stageRank,
  toPublicBeneficiary,
  vietnamDayStart,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  confirmCharityMedia,
  publicOrganizer,
  resolveCharityApprovalStatus,
} from '../charity-campaign/charity-campaign.use-cases';
import { CharityNotifier } from '../charity-campaign/charity.notifier';
import { directChangeAllowed } from './charity-change-review';
import { assertPortionFloors } from './charity-portion-guard';

const ReadPermission = 'campaign.read';
const WritePermission = 'campaign.manage';

/** Vai của người gọi với một dự án. */
interface IProjectAccess {
  campaign: ICharityCampaign;
  isOwner: boolean;
  isCoordinator: boolean;
  isAdminWriter: boolean;
  isAdminReader: boolean;
}

/**
 * Kiểm quyền dùng chung cho mọi use case dự án.
 *
 * - **Sửa hồ sơ** (tab A, nhu cầu, form mở, công khai mục): người tạo hoặc Admin
 *   `campaign.manage` — đúng quy tắc sẵn có "coordinator điều phối, không đổi nội dung".
 * - **Vận hành** (chuyển giai đoạn, xác nhận người tham gia): thêm coordinator.
 * - **Đọc workspace**: người tạo, coordinator, Admin `campaign.read`.
 *
 * Dự án không tồn tại, đã xoá, hoặc người gọi không có vai nào → 404 như nhau: phân biệt hai
 * cái là để người lạ dò được nháp của người khác.
 */
@Injectable()
export class CharityProjectAccess {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Optional()
    @Inject(IEntitlementRepository)
    private readonly entitlements?: IEntitlementRepository,
    @Optional()
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests?: ICharityChangeRequestRepository,
  ) {}

  /**
   * Đang có bản sửa chờ duyệt thì KHÔNG sửa thẳng trường cần duyệt — kể cả người được sửa
   * thẳng: duyệt bản sửa sau đó sẽ âm thầm ghi đè sửa đổi này (review I2, ruling Q7).
   */
  public async assertNoPendingRevision(campaignId: string): Promise<void> {
    if (await this.changeRequests?.findPending(campaignId))
      throw new CharityRevisionPendingExistsException();
  }

  /** Trường quan trọng sửa được NGAY không, hay phải đi bản sửa chờ duyệt (§3.17b). */
  public directChangeAllowed(
    access: IProjectAccess,
    userId: string,
  ): Promise<boolean> {
    return directChangeAllowed(
      { admin: this.admin, entitlements: this.entitlements },
      {
        campaign: access.campaign,
        actorUserId: userId,
        asAdmin: access.isAdminWriter,
      },
    );
  }

  public async maxBeneficiaries(): Promise<number> {
    return normalizeMaxBeneficiaries(
      await this.admin.getConfigValue(CharityMaxBeneficiariesConfigKey),
    );
  }

  public async resolve(
    campaignId: string,
    userId: string,
  ): Promise<IProjectAccess> {
    const campaign = await this.campaigns.findByGlobalId(campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    const isOwner = campaign.createdBy === userId;
    const [isCoordinator, isAdminWriter, isAdminReader] = await Promise.all([
      isOwner
        ? Promise.resolve(false)
        : this.campaigns.isCampaignManager(campaignId, userId),
      this.admin.hasPermission(userId, WritePermission),
      this.admin.hasPermission(userId, ReadPermission),
    ]);
    if (!isOwner && !isCoordinator && !isAdminWriter && !isAdminReader)
      throw new CharityCampaignNotFoundException();
    return { campaign, isOwner, isCoordinator, isAdminWriter, isAdminReader };
  }

  /** Sửa nội dung: người tạo hoặc Admin ghi; dự án phải còn hoạt động (trừ Admin). */
  public async forEdit(
    command: ICharityProjectCommand,
  ): Promise<IProjectAccess> {
    const access = await this.resolve(command.campaignId, command.userId);
    if (!access.isOwner && !access.isAdminWriter)
      throw new CharityProjectForbiddenException();
    // Chỉ chặn dự án bị ĐÌNH CHỈ. Dự án đã đóng vẫn sửa được — tổng kết viết sau khi đóng.
    if (
      isSuspendedProject(access.campaign, new Date()) &&
      !access.isAdminWriter
    )
      throw new CharityProjectInactiveException();
    return access;
  }

  /** Vận hành: thêm coordinator. */
  public async forOperate(
    command: ICharityProjectCommand,
  ): Promise<IProjectAccess> {
    const access = await this.resolve(command.campaignId, command.userId);
    if (!access.isOwner && !access.isCoordinator && !access.isAdminWriter)
      throw new CharityProjectForbiddenException();
    if (
      isSuspendedProject(access.campaign, new Date()) &&
      !access.isAdminWriter
    )
      throw new CharityProjectInactiveException();
    return access;
  }

  public async maxBankAccounts(
    campaignId: string,
    override: number | null,
  ): Promise<number> {
    if (override !== null) return override;
    return normalizeMaxBankAccounts(
      await this.admin.getConfigValue(CharityMaxBankAccountsConfigKey),
    );
  }
}

const trimmed = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

function toView(campaign: ICharityCampaign): ICharityCampaignView {
  return { ...campaign, isJoined: null };
}

/** Gửi duyệt bản nháp — cùng phép quyết trạng thái với lượt tạo (`resolveCharityApprovalStatus`). */
@Injectable()
export class SubmitCharityProjectUseCase implements ISubmitCharityProjectUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityCampaignView> {
    const { campaign, isOwner } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    // Chỉ chủ dự án gửi bản nháp của mình — Admin không gửi thay.
    if (!isOwner) throw new CharityProjectForbiddenException();
    if (campaign.submittedAt !== null)
      throw new CharityProjectNotDraftException();
    const gaps = [
      ...charitySubmitRequirementGaps(
        campaign.acceptedContributionTypes,
        await this.projects.intakeCounts(campaign.globalId),
      ),
      // Mỗi đơn vị nhận cần địa chỉ và giờ trao khi gửi duyệt (CR 22/11/2026 §5.4).
      ...beneficiarySubmitGaps(
        await this.campaigns.listBeneficiaryPlans(campaign.globalId),
      ),
    ];
    if (gaps.length > 0)
      throw new CharitySubmitRequirementsUnmetException(gaps.join('; '));

    let approvalStatus: 'APPROVED' | 'PENDING_APPROVAL' =
      (await resolveCharityApprovalStatus(this.entitlements, this.admin, {
        actorUserId: command.userId,
        asAdmin: false,
        campaignType: campaign.campaignType,
      })) === 'APPROVED'
        ? 'APPROVED'
        : 'PENDING_APPROVAL';
    // Cùng quy tắc với lượt tạo: kêu gọi cho NGƯỜI KHÁC chưa có đồng ý CONFIRMED thì không ra
    // ngoài, kể cả với người có quyền public ngay.
    if (
      approvalStatus === 'APPROVED' &&
      campaign.campaignType === 'INDIVIDUAL_APPEAL' &&
      campaign.beneficiaryRelation === 'OTHER'
    ) {
      const beneficiary = await this.campaigns.findBeneficiary(
        campaign.globalId,
      );
      if (beneficiary?.consentStatus !== 'CONFIRMED')
        approvalStatus = 'PENDING_APPROVAL';
    }

    const outcome = await this.projects.submitDraft({
      campaignId: campaign.globalId,
      actorId: command.userId,
      approvalStatus,
    });
    if (outcome === 'NOT_DRAFT') throw new CharityProjectNotDraftException();
    return toView(
      (await this.campaigns.findByGlobalId(
        campaign.globalId,
      )) as ICharityCampaign,
    );
  }
}

/**
 * Ban tổ chức chuyển giai đoạn (§3.2).
 *
 * - Tiến: đúng MỘT bước (EXECUTION → EVENT → SUMMARY), sớm hơn lịch.
 * - Lùi: bắt buộc lý do, và lịch hiện tại không được đẩy dự án tới lại ngay — không thì lượt
 *   lùi vô nghĩa (đọc lần sau đã nhảy tới). Báo `CHARITY_STAGE_SCHEDULE_CONFLICT` để họ sửa
 *   bước trao trước.
 * - Không về PLAN: PLAN là "chưa duyệt".
 */
/** Tổng duyệt của chiến dịch (CR 22/11/2026 §8) — người vận hành dự án. */
@Injectable()
export class GetCharityRehearsalUseCase implements IGetCharityRehearsalUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.forOperate(command);
    return this.projects.getRehearsal(campaign.globalId);
  }
}

@Injectable()
export class SaveCharityRehearsalUseCase implements ISaveCharityRehearsalUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ISaveCharityRehearsalCommand) {
    const { campaign } = await this.access.forOperate(command);
    const input = command.rehearsal;
    const outcome = input.outcome ?? undefined;
    const reason = trimmed(input.reason);
    if (outcome === 'NOT_READY' && !reason)
      throw new ValidationFailedException([
        'rehearsal.reason: bắt buộc khi tổng duyệt chưa sẵn sàng',
      ]);
    return this.projects.saveRehearsal({
      campaignId: campaign.globalId,
      actorId: command.userId,
      checklist: normalizeRehearsalChecklist(input.checklist),
      outcome,
      reason: outcome === 'READY' ? null : reason,
      note: trimmed(input.note),
    });
  }
}

@Injectable()
export class MoveCharityStageUseCase implements IMoveCharityStageUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    // Tuỳ chọn để spec dựng tay không phải đổi; Nest luôn tiêm (noop ở CLI).
    @Inject(ICharityRealtimePublisher)
    private readonly realtime?: ICharityRealtimePublisher,
  ) {}

  public async handle(
    command: IMoveCharityStageCommand,
  ): Promise<ICharityCampaignView> {
    const { campaign } = await this.access.forOperate(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityStageTransitionInvalidException('dự án chưa được duyệt');
    if (command.to === 'PLAN')
      throw new CharityStageTransitionInvalidException(
        'không quay về Kế hoạch được',
      );

    const current = campaign.operationStage;
    if (command.to === current)
      throw new CharityStageTransitionInvalidException(
        'dự án đã ở giai đoạn này',
      );
    const forward = stageRank(command.to) > stageRank(current);
    if (forward && stageRank(command.to) - stageRank(current) !== 1)
      throw new CharityStageTransitionInvalidException(
        'chỉ tiến từng bước một',
      );
    // Chuyển tay — sớm hơn lịch, bắt kịp khi job trễ, hay lùi — đều phải có lý do và báo
    // người bị ảnh hưởng (§3.2, chốt 05/11).
    const reason = trimmed(command.reason);
    if (!reason)
      throw new CharityStageTransitionInvalidException(
        'chuyển giai đoạn thủ công phải có lý do',
      );
    // Cổng chặn khi tiến (CR 22/11/2026): sang Sự kiện trao cần tổng duyệt READY; sang Tổng
    // kết cần bước trao hoàn tất (bằng chứng đúng hình thức, tài khoản thụ hưởng hợp lệ).
    if (forward && command.to === 'EVENT') {
      const rehearsal = await this.projects.getRehearsal(campaign.globalId);
      if (rehearsal?.outcome !== 'READY')
        throw new CharityRehearsalNotReadyException();
    }
    if (forward && command.to === 'SUMMARY') {
      const stored = await this.projects.distributionSettlement(
        campaign.globalId,
      );
      const settlement = charityDistributionSettled({
        distributionMethod: stored.method,
        evidenceUrls: stored.evidenceUrls,
        trackingCode: stored.trackingCode,
        beneficiaryAccount: stored.beneficiaryAccount,
      });
      if (settlement.evidenceGaps.length > 0)
        throw new CharityRoundEvidenceRequiredException(
          settlement.evidenceGaps.join(', '),
        );
      if (!settlement.accountVerified)
        throw new CharityBeneficiaryAccountNotVerifiedException();
    }
    if (!forward) {
      // Lùi chỉ hợp lệ khi lịch + cổng không tự đẩy dự án tiến lại ngay.
      const [rehearsal, stored] = await Promise.all([
        this.projects.getRehearsal(campaign.globalId),
        this.projects.distributionSettlement(campaign.globalId),
      ]);
      const wouldBe = effectiveOperationStage({
        stored: command.to,
        distribution: campaign.distribution,
        endTime: campaign.endTime,
        now: new Date(),
        rehearsalReady: rehearsal?.outcome === 'READY',
        distributionSettled: charityDistributionSettled({
          distributionMethod: stored.method,
          evidenceUrls: stored.evidenceUrls,
          trackingCode: stored.trackingCode,
          beneficiaryAccount: stored.beneficiaryAccount,
        }).settled,
      });
      if (wouldBe !== command.to)
        throw new CharityStageScheduleConflictException();
    }

    // Cột lưu trễ so với mốc thời gian (job chưa chạy): ghi bước bắt kịp trước để nhật ký
    // kể đúng chuyện đã xảy ra.
    let from = campaign.storedOperationStage;
    if (from !== current) {
      await this.projects.moveStage({
        campaignId: campaign.globalId,
        from,
        to: current,
        actorId: null,
        reason: 'Tới mốc thời gian',
      });
      from = current;
    }
    const outcome = await this.projects.moveStage({
      campaignId: campaign.globalId,
      from,
      to: command.to,
      actorId: command.userId,
      reason,
    });
    if (outcome === 'STALE')
      throw new CharityStageTransitionInvalidException(
        'giai đoạn vừa đổi bởi người khác — tải lại rồi thử lại',
      );
    this.realtime?.signal(campaign.globalId, ['STAGE'], 'public');
    return toView(
      (await this.campaigns.findByGlobalId(
        campaign.globalId,
      )) as ICharityCampaign,
    );
  }
}

/** Lời nhắc ban tổ chức khi job bị cổng giữ lại (CR 22/11/2026 §3.17g). */
const OrganizerReminderText: Record<CharityOrganizerReminderReason, string> = {
  REHEARSAL_NOT_READY:
    'đã tới giờ trao nhưng tổng duyệt chưa sẵn sàng — hoàn tất tổng duyệt để sang Sự kiện trao.',
  DISTRIBUTION_EVIDENCE_MISSING:
    'đã hết giờ trao nhưng còn thiếu bằng chứng trao — bổ sung ảnh (và mã vận đơn nếu gửi hàng) để sang Tổng kết.',
  BENEFICIARY_ACCOUNT_NOT_VERIFIED:
    'đã hết giờ trao nhưng tài khoản thụ hưởng chưa được xác thực — liên hệ Admin để xác thực.',
  SUMMARY_OVERDUE:
    'đã quá hạn đăng bài tổng kết — đăng tổng kết để đóng chiến dịch.',
};

/**
 * Job ngoài tiến trình `charity:advance-stage` — ghi xuống giai đoạn đã tới mốc VÀ qua cổng
 * (tổng duyệt READY, bước trao hoàn tất). Hàng bị giữ được nhắc chủ dự án mỗi ngày một lần
 * cho từng lý do. Không bao giờ nhảy EXECUTION→SUMMARY trong một lần chạy.
 */
@Injectable()
export class AdvanceCharityStagesUseCase implements IAdvanceCharityStagesUseCase {
  private readonly logger = new Logger(AdvanceCharityStagesUseCase.name);

  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async handle(command: {
    limit: number;
    dryRun: boolean;
  }): Promise<{ advanced: number; checked: number; reminded: number }> {
    const now = new Date();
    const candidates = await this.projects.listStageCandidates(command.limit);
    let advanced = 0;
    for (const candidate of candidates) {
      const reached = effectiveOperationStage({
        stored: candidate.stored,
        distribution: candidate.distribution,
        endTime: candidate.endTime,
        now,
        rehearsalReady: candidate.rehearsalReady,
        distributionSettled: candidate.distributionSettled,
      });
      // Một bước mỗi lần chạy: EXECUTION chỉ sang EVENT, kể cả khi đã quá giờ kết thúc.
      const target =
        candidate.stored === 'EXECUTION' && reached === 'SUMMARY'
          ? 'EVENT'
          : reached;
      if (target === candidate.stored) continue;
      if (command.dryRun) {
        advanced += 1;
        continue;
      }
      const outcome = await this.projects.moveStage({
        campaignId: candidate.campaignId,
        from: candidate.stored,
        to: target,
        actorId: null,
        reason: 'Tới mốc thời gian',
      });
      if (outcome === 'MOVED') advanced += 1;
      else this.logger.log(`Bỏ qua ${candidate.campaignId}: giai đoạn vừa đổi`);
    }

    const blocked: {
      campaignId: string;
      ownerId: string;
      reason: CharityOrganizerReminderReason;
    }[] = [
      ...(await this.projects.listBlockedStageCampaigns(
        command.limit,
        vietnamDayStart(now).toISOString(),
      )),
      ...(
        await this.projects.listOverdueSummaries(
          command.limit,
          vietnamDayStart(now).toISOString(),
        )
      ).map((row) => ({ ...row, reason: 'SUMMARY_OVERDUE' as const })),
    ];
    let reminded = 0;
    const day = vietnamDayStart(now).toISOString();
    for (const row of blocked) {
      if (command.dryRun) {
        reminded += 1;
        continue;
      }
      try {
        await this.dispatch.handle({
          userId: row.ownerId,
          type: NotificationTypes.CHARITY_ORGANIZER_REMINDER,
          title: 'Chiến dịch đang chờ bạn',
          body: `Chiến dịch của bạn ${OrganizerReminderText[row.reason]}`,
          referenceType: 'CHARITY_CAMPAIGN',
          referenceId: row.campaignId,
          target: {
            type: NotificationTargetTypes.CHARITY_CAMPAIGN,
            id: row.campaignId,
          },
          idempotencyKey: `CHARITY_ORGANIZER_REMINDER:${row.campaignId}:${row.reason}:${day}`,
          pushData: { reason: row.reason },
        });
        reminded += 1;
      } catch (error) {
        this.logger.warn(
          `Không gửi được nhắc ${row.reason} cho ${row.campaignId}: ${(error as Error).message}`,
        );
      }
    }
    return { advanced, checked: candidates.length, reminded };
  }
}

@Injectable()
export class UpdateCharityProfileUseCase implements IUpdateCharityProfileUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IUpdateCharityProfileCommand) {
    const access = await this.access.forEdit(command);
    const { campaign } = access;
    const current = await this.projects.getProfile(campaign.globalId);
    if (!current) throw new CharityCampaignNotFoundException();
    // Bỏ trống = giữ nguyên; `null` = xoá.
    const pick = (value: string | null | undefined, previous: string | null) =>
      value === undefined ? previous : trimmed(value);
    // Loại tiếp nhận là trường cần duyệt sau khi duyệt (CR 22/11/2026 §3.17b).
    if (
      command.profile.acceptedContributionTypes !== undefined &&
      reviewedFieldsChanged(
        { acceptedContributionTypes: [...current.acceptedContributionTypes] },
        {
          acceptedContributionTypes: normalizeContributionTypes(
            command.profile.acceptedContributionTypes,
          ),
        },
      ).length > 0
    ) {
      await this.access.assertNoPendingRevision(campaign.globalId);
      if (!(await this.access.directChangeAllowed(access, command.userId)))
        throw new CharityChangeRequiresReviewException(
          'acceptedContributionTypes',
        );
    }
    const next = {
      appealPurpose: pick(command.profile.appealPurpose, current.appealPurpose),
      appealAudience: pick(
        command.profile.appealAudience,
        current.appealAudience,
      ),
      appealCircumstance: pick(
        command.profile.appealCircumstance,
        current.appealCircumstance,
      ),
      callToActions: command.profile.callToActions
        ? [...new Set(command.profile.callToActions)]
        : current.callToActions,
      acceptedContributionTypes:
        command.profile.acceptedContributionTypes === undefined
          ? current.acceptedContributionTypes
          : normalizeContributionTypes(
              command.profile.acceptedContributionTypes,
            ),
    };
    await this.projects.updateProfile({
      campaignId: campaign.globalId,
      actorId: command.userId,
      profile: next,
    });
    return { ...next, maxBankAccounts: current.maxBankAccounts };
  }
}

@Injectable()
export class ReplaceCharityPartiesUseCase implements IReplaceCharityPartiesUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IReplaceCharityPartiesCommand) {
    const access = await this.access.forEdit(command);
    const { campaign } = access;
    const errors: string[] = [];
    const beneficiaryCount = command.parties.filter(
      (party) => party.role === 'BENEFICIARY',
    ).length;
    if (beneficiaryCount > 0) {
      const max = await this.access.maxBeneficiaries();
      if (beneficiaryCount > max)
        errors.push(
          `parties: tối đa ${max} đơn vị nhận (charity.max_beneficiaries_per_campaign)`,
        );
    }
    for (const [index, party] of command.parties.entries()) {
      if ((party.role === 'BENEFICIARY') !== (party.beneficiaryKind !== null))
        errors.push(
          `parties[${index}].beneficiaryKind: bắt buộc với BENEFICIARY, bỏ trống với vai khác`,
        );
      if (party.evidenceUrls.some((url) => !/^https:\/\//.test(url)))
        errors.push(`parties[${index}].evidenceUrls: phải là URL https`);
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    // Bỏ một bên còn giữ tài khoản thụ hưởng đang hiệu lực → phải đóng tài khoản trước.
    // Đổi tên bên đó KHÔNG làm mất xác thực của tài khoản.
    const kept = new Set(command.parties.map((party) => party.partyId));
    const [previous, accounts] = await Promise.all([
      this.projects.listParties(campaign.globalId),
      this.projects.listBeneficiaryBankAccounts(campaign.globalId),
    ]);
    // Dòng người thụ hưởng của kêu gọi cá nhân không bao giờ bị `replaceParties` xoá — bỏ qua.
    for (const party of previous)
      if (
        !party.isAppealSubject &&
        !kept.has(party.partyId) &&
        accounts.some(
          (account) =>
            account.partyId === party.partyId && account.validTo === null,
        )
      )
        errors.push(
          `parties: bên thụ hưởng "${party.name}" còn tài khoản thụ hưởng đang hiệu lực — đóng tài khoản trước`,
        );
    if (errors.length > 0) throw new ValidationFailedException(errors);

    // Sau duyệt (CR 22/11/2026 §3.17b): thêm/bỏ đơn vị nhận, đổi số suất hoặc tiền ước tính
    // phải qua bản sửa chờ duyệt. Trường khác (SĐT, người phụ trách…) áp ngay.
    const previousById = new Map(
      previous
        .filter((party) => !party.isAppealSubject)
        .map((party) => [party.partyId, party]),
    );
    if (charityBeneficiaryPlanChanged(previous, command.parties)) {
      await this.access.assertNoPendingRevision(campaign.globalId);
      if (!(await this.access.directChangeAllowed(access, command.userId)))
        throw new CharityChangeRequiresReviewException('beneficiaries');
    }

    // Sàn hai chiều: tổng suất/tiền mới vẫn phải nằm dưới mục tiêu nhu cầu hiện có.
    const plans = command.parties
      .filter((party) => party.role === 'BENEFICIARY')
      .map((party) => {
        const before = party.partyId
          ? previousById.get(party.partyId)
          : undefined;
        return {
          estimatedPortions:
            party.estimatedPortions ?? before?.estimatedPortions ?? 0,
          estimatedAmount:
            party.estimatedAmount ?? before?.estimatedAmount ?? 0,
        };
      });
    await assertCampaignPortionFloors(this.projects, campaign, { plans });
    await assertBeneficiariesInsideWindow(
      this.projects,
      campaign.globalId,
      campaign.distribution,
      command.parties
        .filter((party) => party.role === 'BENEFICIARY')
        .map((party) => ({
          name: party.name.trim(),
          distributionAt:
            party.distributionAt !== undefined
              ? party.distributionAt
              : ((party.partyId
                  ? previousById.get(party.partyId)?.distributionAt
                  : null) ?? null),
        })),
    );

    return this.projects.replaceParties({
      campaignId: campaign.globalId,
      actorId: command.userId,
      parties: command.parties.map((party) => ({
        ...party,
        name: party.name.trim(),
      })),
    });
  }
}

/**
 * Thêm/bỏ một đơn vị nhận, hoặc đổi số suất / tiền ước tính của nó — các thay đổi cần duyệt
 * sau khi chiến dịch đã duyệt. `undefined` (app cũ không gửi) không tính là đổi.
 */
function charityBeneficiaryPlanChanged(
  previous: readonly ICharityParty[],
  next: readonly ICharityPartyInput[],
): boolean {
  const before = previous.filter(
    (party) => !party.isAppealSubject && party.role === 'BENEFICIARY',
  );
  const after = next.filter((party) => party.role === 'BENEFICIARY');
  const beforeIds = new Set(before.map((party) => party.partyId));
  const afterIds = new Set(
    after.map((party) => party.partyId).filter((id): id is string => !!id),
  );
  if (after.some((party) => !party.partyId || !beforeIds.has(party.partyId)))
    return true;
  if (before.some((party) => !afterIds.has(party.partyId))) return true;
  return after.some((party) => {
    const old = before.find((row) => row.partyId === party.partyId)!;
    return (
      (party.estimatedPortions !== undefined &&
        party.estimatedPortions !== old.estimatedPortions) ||
      (party.estimatedAmount !== undefined &&
        party.estimatedAmount !== old.estimatedAmount)
    );
  });
}

/**
 * Kiểm sàn số suất/tiền của MỘT chiến dịch với dữ liệu đang lưu, thay từng phần bằng giá trị
 * sắp ghi (`plans` = đơn vị nhận mới, `needOverride` = một nhu cầu sắp sửa, `fundingOverride`
 * = một nhu cầu tiền sắp lưu).
 */
async function assertCampaignPortionFloors(
  projects: ICharityProjectRepository,
  campaign: ICharityCampaign,
  overrides: {
    plans?: { estimatedPortions: number; estimatedAmount: number }[];
    needOverride?: {
      needItemId: string;
      targetQuantity: number;
      quantityPerPortion: number;
    };
    fundingOverride?: {
      fundingNeedId: string | null;
      targetAmount: number;
      closed: boolean;
    };
  },
): Promise<void> {
  const [parties, needs, funding] = await Promise.all([
    overrides.plans
      ? Promise.resolve(null)
      : projects.listParties(campaign.globalId),
    projects.listItemNeeds(campaign.globalId),
    projects.listFundingNeeds(campaign.globalId),
  ]);
  const plans =
    overrides.plans ??
    (parties ?? [])
      .filter((party) => party.role === 'BENEFICIARY')
      .map((party) => ({
        estimatedPortions: party.estimatedPortions ?? 0,
        estimatedAmount: party.estimatedAmount ?? 0,
      }));
  const needRows = needs
    .filter((need) => need.isActive)
    .map((need, index) => {
      const override =
        overrides.needOverride?.needItemId === need.needItemId
          ? overrides.needOverride
          : null;
      return {
        index,
        needItemId: need.needItemId,
        itemName: need.itemName,
        targetQuantity: override?.targetQuantity ?? need.targetQuantity,
        quantityPerPortion:
          override?.quantityPerPortion ?? need.quantityPerPortion ?? 1,
      };
    });
  const fundingRows = funding
    .filter(
      (row) =>
        row.fundingNeedId !== overrides.fundingOverride?.fundingNeedId &&
        row.status !== 'CLOSED',
    )
    .map((row) => row.targetAmount);
  if (overrides.fundingOverride && !overrides.fundingOverride.closed)
    fundingRows.push(overrides.fundingOverride.targetAmount);
  assertPortionFloors({
    needs: needRows,
    // Tiền chỉ có nghĩa khi chiến dịch nhận tiền.
    fundingTargets: campaign.acceptedContributionTypes.includes('MONEY')
      ? fundingRows
      : [],
    beneficiaries: campaign.acceptedContributionTypes.includes('MONEY')
      ? plans
      : plans.map((plan) => ({ ...plan, estimatedAmount: 0 })),
  });
}

@Injectable()
export class AddCharityBankAccountUseCase implements IAddCharityBankAccountUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IAddCharityBankAccountCommand) {
    const { campaign } = await this.access.forEdit(command);
    assertContributionTypeAccepted(campaign, 'MONEY');
    const profile = await this.projects.getProfile(campaign.globalId);
    const limit = await this.access.maxBankAccounts(
      campaign.globalId,
      profile?.maxBankAccounts ?? null,
    );
    const outcome = await this.projects.addBankAccount({
      campaignId: campaign.globalId,
      actorId: command.userId,
      account: {
        label: trimmed(command.account.label),
        bankName: command.account.bankName.trim(),
        bankBin: command.account.bankBin,
        accountNo: command.account.accountNo.trim(),
        accountName: command.account.accountName.trim(),
      },
      replacesAccountId: command.replacesAccountId,
      replaceReason: trimmed(command.replaceReason),
      limit,
    });
    if (outcome.status === 'LIMIT_REACHED')
      throw new CharityBankAccountLimitException(outcome.limit);
    if (outcome.status === 'REPLACED_NOT_FOUND')
      throw new CharityBankAccountNotFoundException();
    return outcome.account;
  }
}

@Injectable()
export class CloseCharityBankAccountUseCase implements ICloseCharityBankAccountUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICloseCharityBankAccountCommand,
  ): Promise<{ closed: true }> {
    const { campaign } = await this.access.forEdit(command);
    const closed = await this.projects.closeBankAccount({
      campaignId: campaign.globalId,
      accountId: command.accountId,
      actorId: command.userId,
      reason: command.reason.trim(),
    });
    if (!closed) throw new CharityBankAccountNotFoundException();
    return { closed: true };
  }
}

@Injectable()
export class AddCharityBeneficiaryBankAccountUseCase implements IAddCharityBeneficiaryBankAccountUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IAddCharityBeneficiaryBankAccountCommand) {
    const { campaign } = await this.access.forEdit(command);
    assertContributionTypeAccepted(campaign, 'MONEY');
    const account = command.account;
    let expected: string | null;
    if (account.holderType === 'OWNER') {
      expected = await this.projects.findOwnerFullName(campaign.globalId);
    } else {
      const party = (await this.projects.listParties(campaign.globalId)).find(
        (row) => row.partyId === account.partyId && row.role === 'BENEFICIARY',
      );
      if (!party)
        throw new ValidationFailedException([
          'beneficiaryBankAccount.partyId: phải là bên thụ hưởng của dự án này',
        ]);
      expected = party.name;
    }
    if (!holderNameMatches(account.accountName, expected))
      throw new CharityBeneficiaryAccountNameMismatchException(
        expected?.trim() || '(chủ dự án chưa khai họ tên)',
      );
    const outcome = await this.projects.addBeneficiaryBankAccount({
      campaignId: campaign.globalId,
      actorId: command.userId,
      account: {
        holderType: account.holderType,
        partyId: account.holderType === 'OWNER' ? null : account.partyId,
        bankName: account.bankName.trim(),
        accountNo: account.accountNo.trim(),
        accountName: account.accountName.trim(),
      },
      replacesAccountId: command.replacesAccountId,
      replaceReason: trimmed(command.replaceReason),
    });
    if (outcome.status === 'REPLACED_NOT_FOUND')
      throw new CharityBankAccountNotFoundException();
    return outcome.account;
  }
}

@Injectable()
export class CloseCharityBeneficiaryBankAccountUseCase implements ICloseCharityBeneficiaryBankAccountUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICloseCharityBeneficiaryBankAccountCommand,
  ): Promise<{ closed: true }> {
    const { campaign } = await this.access.forEdit(command);
    const closed = await this.projects.closeBeneficiaryBankAccount({
      campaignId: campaign.globalId,
      accountId: command.accountId,
      actorId: command.userId,
      reason: command.reason.trim(),
    });
    if (!closed) throw new CharityBankAccountNotFoundException();
    return { closed: true };
  }
}

@Injectable()
export class VerifyCharityBeneficiaryBankAccountUseCase implements IVerifyCharityBeneficiaryBankAccountUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IVerifyCharityBeneficiaryBankAccountCommand) {
    if (!(await this.admin.hasPermission(command.userId, WritePermission)))
      throw new CharityProjectForbiddenException();
    const account = await this.projects.verifyBeneficiaryBankAccount({
      campaignId: command.campaignId,
      accountId: command.accountId,
      actorId: command.userId,
    });
    if (!account) throw new CharityBankAccountNotFoundException();
    return account;
  }
}

@Injectable()
export class ReplaceCharityTeamUseCase implements IReplaceCharityTeamUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  public async handle(command: IReplaceCharityTeamCommand) {
    const { campaign } = await this.access.forEdit(command);
    const accounts = new Set(
      (await this.projects.listBankAccounts(campaign.globalId)).map(
        (a) => a.accountId,
      ),
    );
    const errors: string[] = [];
    for (const [index, member] of command.members.entries()) {
      if (member.bankAccountId && !accounts.has(member.bankAccountId))
        errors.push(
          `team[${index}].bankAccountId: không phải tài khoản của dự án này`,
        );
      if (member.userId) {
        const user = await this.users.findOneBy({ globalId: member.userId });
        if (!user || user.deletedAt)
          errors.push(`team[${index}].userId: không tìm thấy tài khoản`);
      }
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    return this.projects.replaceTeam({
      campaignId: campaign.globalId,
      actorId: command.userId,
      members: command.members.map((member) => ({
        ...member,
        displayName: member.displayName.trim(),
      })),
    });
  }
}

@Injectable()
export class ReplaceCharityPhasesUseCase implements IReplaceCharityPhasesUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IReplaceCharityPhasesCommand) {
    const { campaign } = await this.access.forEdit(command);
    const errors = phaseScheduleGaps(command.phases);
    for (const phase of command.phases) {
      if (phase.deliveryMethod && phase.phase !== 'DISTRIBUTION')
        errors.push(`phases: deliveryMethod chỉ dùng cho DISTRIBUTION`);
      if (phase.reportMode && phase.phase !== 'REPORTING')
        errors.push(`phases: reportMode chỉ dùng cho REPORTING`);
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const distribution = command.phases.find(
      (phase) => phase.phase === 'DISTRIBUTION',
    );
    await assertBeneficiariesInsideWindow(
      this.projects,
      campaign.globalId,
      distribution
        ? { startsAt: distribution.startsAt, endsAt: distribution.endsAt }
        : null,
    );
    return this.projects.replacePhases({
      campaignId: campaign.globalId,
      actorId: command.userId,
      phases: command.phases,
    });
  }
}

/**
 * Đơn vị nhận có giờ trao nằm ngoài khung trao → 400 0x13_5c (CR 22/11/2026 §3.17d).
 * `parties` bỏ trống = đọc đơn vị nhận đang lưu.
 */
async function assertBeneficiariesInsideWindow(
  projects: ICharityProjectRepository,
  campaignId: string,
  window: { startsAt: Date; endsAt: Date } | null,
  parties?: readonly { name: string; distributionAt: Date | null }[],
): Promise<void> {
  if (!window) return;
  const list =
    parties ??
    (await projects.listParties(campaignId))
      .filter((party) => party.role === 'BENEFICIARY' && !party.isAppealSubject)
      .map((party) => ({
        name: party.name,
        distributionAt: party.distributionAt ?? null,
      }));
  const outside = beneficiariesOutsideWindow(list, window);
  if (outside.length > 0)
    throw new CharityBeneficiaryDistributionTimeOutOfRangeException(
      outside.map((row) => ({
        index: row.index,
        name: row.name,
        distributionAt: row.distributionAt.toISOString(),
      })),
    );
}

/** Nhu cầu có hạn nộp sau khi hết tiếp nhận → 400 0x13_62. */
function assertIntakeDeadlines(
  needs: readonly {
    itemName: string;
    isActive: boolean;
    intakeDeadline: Date | null;
  }[],
  intakeEndsAt: Date | null,
): void {
  if (!intakeEndsAt) return;
  const late = needs.filter(
    (need) =>
      need.isActive &&
      need.intakeDeadline &&
      need.intakeDeadline.getTime() > intakeEndsAt.getTime(),
  );
  if (late.length > 0)
    throw new CharityScheduleInvalidException(
      late
        .map(
          (need) =>
            `itemNeeds.intakeDeadline (${need.itemName}): phải ≤ intakeEndsAt`,
        )
        .join('; '),
    );
}

/** `PUT :id/intake-locations` (CR 22/11/2026 §3.17c). */
@Injectable()
export class ReplaceCharityIntakeLocationsUseCase implements IReplaceCharityIntakeLocationsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IReplaceCharityIntakeLocationsCommand) {
    const { campaign } = await this.access.forEdit(command);
    const locations = command.intakeLocations.map((location) => ({
      label: location.label.trim(),
      address: trimmed(location.address),
      lat: location.lat ?? null,
      lng: location.lng ?? null,
      scheduleNote: trimmed(location.scheduleNote),
      contactName: trimmed(location.contactName),
      contactPhone: trimmed(location.contactPhone),
    }));
    const max = normalizeMaxIntakeLocations(
      await this.admin.getConfigValue(CharityMaxIntakeLocationsConfigKey),
    );
    const errors: string[] = [];
    if (locations.length > max)
      errors.push(
        `intakeLocations: tối đa ${max} điểm (charity.max_intake_locations)`,
      );
    if (
      locations.length === 0 &&
      campaign.acceptedContributionTypes.includes('MATERIAL')
    )
      errors.push('intakeLocations: tối thiểu 1');
    for (const [index, location] of locations.entries()) {
      if (!location.label)
        errors.push(`intakeLocations[${index}].label: bắt buộc`);
      if ((location.lat === null) !== (location.lng === null))
        errors.push(`intakeLocations[${index}].lng: cần gửi cùng lat`);
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    return this.campaigns.replaceIntakeLocations({
      campaignId: campaign.globalId,
      actorId: command.userId,
      locations,
    });
  }
}

/**
 * `PUT :id/schedule` (CR 22/11/2026 §3.17b) — áp ngay cả sau duyệt. Thứ tự: khung hợp lệ →
 * đơn vị nhận trong khung trao → hạn nộp của nhu cầu không sau khi hết tiếp nhận.
 */
@Injectable()
export class SaveCharityScheduleUseCase implements ISaveCharityScheduleUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ISaveCharityScheduleCommand) {
    const { campaign } = await this.access.forEdit(command);
    const schedule = command.schedule;
    const gaps = charityScheduleGaps(schedule);
    if (schedule.distributionEndsAt <= schedule.distributionStartsAt)
      gaps.push('schedule.distributionEndsAt: phải sau distributionStartsAt');
    if (schedule.endTime <= schedule.intakeStartsAt)
      gaps.push('schedule.endTime: phải sau intakeStartsAt');
    if (gaps.length > 0)
      throw new CharityScheduleInvalidException(gaps.join('; '));
    await assertBeneficiariesInsideWindow(this.projects, campaign.globalId, {
      startsAt: schedule.distributionStartsAt,
      endsAt: schedule.distributionEndsAt,
    });
    assertIntakeDeadlines(
      await this.projects.listItemNeeds(campaign.globalId),
      schedule.intakeEndsAt,
    );
    await this.campaigns.saveSchedule({
      campaignId: campaign.globalId,
      actorId: command.userId,
      ...schedule,
    });
    return toView(
      (await this.campaigns.findByGlobalId(
        campaign.globalId,
      )) as ICharityCampaign,
    );
  }
}

@Injectable()
export class UpdateCharityItemNeedUseCase implements IUpdateCharityItemNeedUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IUpdateCharityItemNeedCommand) {
    const { campaign } = await this.access.forEdit(command);
    const surplusExplanation =
      command.surplusExplanation === undefined
        ? undefined
        : trimmed(command.surplusExplanation);
    if (command.targetQuantity !== undefined) {
      const current = (
        await this.projects.listItemNeeds(campaign.globalId)
      ).find((need) => need.needItemId === command.needItemId);
      if (!current) throw new CharityNeedItemInvalidException();
      const received =
        current.receivedInAppQuantity + current.receivedExternalQuantity;
      const explanation =
        surplusExplanation === undefined
          ? current.surplusExplanation
          : surplusExplanation;
      // Giảm mục tiêu dưới số đã nhận: phần dư phải giải trình công khai (§3.18).
      if (command.targetQuantity < received && !explanation)
        throw new ValidationFailedException([
          `itemNeed.surplusExplanation: bắt buộc khi mục tiêu (${command.targetQuantity}) thấp hơn số đã nhận (${received})`,
        ]);
    }
    // Sàn theo số suất (CR 22/11/2026): mục tiêu không được thấp hơn tổng suất × mỗi suất.
    if (
      command.targetQuantity !== undefined ||
      command.quantityPerPortion !== undefined
    ) {
      const current = (
        await this.projects.listItemNeeds(campaign.globalId)
      ).find((need) => need.needItemId === command.needItemId);
      if (!current) throw new CharityNeedItemInvalidException();
      await assertCampaignPortionFloors(this.projects, campaign, {
        needOverride: {
          needItemId: current.needItemId,
          targetQuantity: command.targetQuantity ?? current.targetQuantity,
          quantityPerPortion:
            command.quantityPerPortion ?? current.quantityPerPortion,
        },
      });
    }
    assertIntakeDeadlines(
      [
        {
          itemName: 'itemNeed',
          isActive: true,
          intakeDeadline: command.profile.intakeDeadline,
        },
      ],
      campaign.intakeEndsAt,
    );
    const updated = await this.projects.updateItemNeedProfile({
      campaignId: campaign.globalId,
      needItemId: command.needItemId,
      actorId: command.userId,
      profile: command.profile,
      targetQuantity: command.targetQuantity,
      quantityPerPortion: command.quantityPerPortion,
      surplusExplanation,
    });
    if (!updated) throw new CharityNeedItemInvalidException();
    const needs = await this.projects.listItemNeeds(campaign.globalId);
    return needs.find((need) => need.needItemId === command.needItemId)!;
  }
}

@Injectable()
export class SaveCharityFundingNeedUseCase implements ISaveCharityFundingNeedUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ISaveCharityFundingNeedCommand) {
    const { campaign } = await this.access.forEdit(command);
    if (!campaign.acceptedContributionTypes.includes('MONEY'))
      return this.closeWhileMoneyDisabled(campaign, command);
    const need = command.need;
    const errors: string[] = [];
    if (need.beneficiaryPartyId) {
      const party = (await this.projects.listParties(campaign.globalId)).find(
        (row) => row.partyId === need.beneficiaryPartyId,
      );
      if (party?.role !== 'BENEFICIARY')
        errors.push(
          'fundingNeed.beneficiaryPartyId: phải là bên thụ hưởng của dự án này',
        );
    }
    if (need.bankAccountId) {
      const account = (
        await this.projects.listBankAccounts(campaign.globalId)
      ).find((row) => row.accountId === need.bankAccountId);
      if (!account || account.validTo !== null)
        errors.push(
          'fundingNeed.bankAccountId: phải là tài khoản ĐANG hiệu lực của dự án này',
        );
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    const normalized = {
      ...need,
      title: need.title.trim(),
      description: trimmed(need.description),
    };

    // Sàn tiền (CR 22/11/2026): tổng mục tiêu tiền đang mở ≥ tổng tiền ước tính.
    await assertCampaignPortionFloors(this.projects, campaign, {
      fundingOverride: {
        fundingNeedId: command.fundingNeedId ?? null,
        targetAmount: normalized.targetAmount,
        closed: command.status === 'CLOSED',
      },
    });

    if (!command.fundingNeedId)
      return this.projects.createFundingNeed({
        campaignId: campaign.globalId,
        actorId: command.userId,
        need: normalized,
      });
    const current = (
      await this.projects.listFundingNeeds(campaign.globalId)
    ).find((row) => row.fundingNeedId === command.fundingNeedId);
    if (!current) throw new CharityFundingNeedNotFoundException();
    const updated = await this.projects.updateFundingNeed({
      campaignId: campaign.globalId,
      fundingNeedId: command.fundingNeedId,
      actorId: command.userId,
      need: normalized,
      confirmedAmount: command.confirmedAmount ?? current.confirmedAmount,
      externalAmount: command.externalAmount ?? current.externalAmount,
      status: command.status ?? current.status,
    });
    if (!updated) throw new CharityFundingNeedNotFoundException();
    return updated;
  }

  /**
   * MONEY đã tắt: không tạo mới, nhưng vẫn cho đóng nhu cầu cũ và ghi số tiền đã nhận — nếu
   * không, dự án kẹt ở điều kiện hoàn tất. Mọi thay đổi khác, hoặc mở lại, vẫn là 409.
   */
  private async closeWhileMoneyDisabled(
    campaign: ICharityCampaign,
    command: ISaveCharityFundingNeedCommand,
  ) {
    if (!command.fundingNeedId)
      assertContributionTypeAccepted(campaign, 'MONEY');
    const current = (
      await this.projects.listFundingNeeds(campaign.globalId)
    ).find((row) => row.fundingNeedId === command.fundingNeedId);
    if (!current) throw new CharityFundingNeedNotFoundException();
    const need = command.need;
    const unchanged =
      need.title.trim() === current.title &&
      trimmed(need.description) === current.description &&
      need.beneficiaryPartyId === current.beneficiaryPartyId &&
      need.bankAccountId === current.bankAccountId &&
      need.targetAmount === current.targetAmount &&
      (need.deadline?.getTime() ?? null) ===
        (current.deadline?.getTime() ?? null) &&
      need.sortOrder === current.sortOrder;
    const status = command.status ?? current.status;
    if (!unchanged || (status !== current.status && status !== 'CLOSED'))
      assertContributionTypeAccepted(campaign, 'MONEY');
    const updated = await this.projects.updateFundingNeed({
      campaignId: campaign.globalId,
      fundingNeedId: current.fundingNeedId,
      actorId: command.userId,
      need: {
        title: current.title,
        description: current.description,
        beneficiaryPartyId: current.beneficiaryPartyId,
        bankAccountId: current.bankAccountId,
        targetAmount: current.targetAmount,
        deadline: current.deadline,
        sortOrder: current.sortOrder,
      },
      confirmedAmount: command.confirmedAmount ?? current.confirmedAmount,
      externalAmount: command.externalAmount ?? current.externalAmount,
      status,
    });
    if (!updated) throw new CharityFundingNeedNotFoundException();
    return updated;
  }
}

@Injectable()
export class SaveCharityVolunteerNeedUseCase implements ISaveCharityVolunteerNeedUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: ISaveCharityVolunteerNeedCommand) {
    const { campaign } = await this.access.forEdit(command);
    const need = {
      ...command.need,
      title: command.need.title.trim(),
      description: trimmed(command.need.description),
      requirements: trimmed(command.need.requirements),
      locationLabel: trimmed(command.need.locationLabel),
    };
    if (need.startsAt && need.endsAt && need.endsAt <= need.startsAt)
      throw new ValidationFailedException([
        'volunteerNeed.endsAt: phải sau thời điểm bắt đầu',
      ]);
    if (!command.volunteerNeedId)
      return this.projects.createVolunteerNeed({
        campaignId: campaign.globalId,
        actorId: command.userId,
        need,
      });
    const current = (
      await this.projects.listVolunteerNeeds(campaign.globalId)
    ).find((row) => row.volunteerNeedId === command.volunteerNeedId);
    if (!current) throw new CharityVolunteerNeedNotFoundException();
    const updated = await this.projects.updateVolunteerNeed({
      campaignId: campaign.globalId,
      volunteerNeedId: command.volunteerNeedId,
      actorId: command.userId,
      need,
      status: command.status ?? current.status,
    });
    if (!updated) throw new CharityVolunteerNeedNotFoundException();
    return updated;
  }
}

/**
 * Đăng ký tham gia một vị trí (§3.11). Dự án phải công khai và đang hoạt động; sau khi bước trao
 * bắt đầu (giai đoạn EVENT trở đi) thì không nhận đăng ký mới.
 */
@Injectable()
export class RegisterCharityVolunteerUseCase implements IRegisterCharityVolunteerUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICharityVolunteerRegistrationCommand,
  ): Promise<{ registered: true }> {
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign || !isPubliclyVisibleProject(campaign, new Date()))
      throw new CharityCampaignNotFoundException();
    if (stageRank(campaign.operationStage) >= stageRank('EVENT'))
      throw new CharityVolunteerClosedException();
    // Hết tiếp nhận (CR 22/11/2026 §3.9): đăng ký qua tuyển công sức là vai PARTICIPANT.
    if (isIntakeClosed(campaign, new Date()))
      throw new CharityIntakeClosedException();
    const outcome = await this.projects.registerVolunteer({
      campaignId: campaign.globalId,
      volunteerNeedId: command.volunteerNeedId,
      userId: command.userId,
      note: trimmed(command.note),
    });
    switch (outcome) {
      case 'REGISTERED':
      case 'ALREADY_REGISTERED':
        return { registered: true };
      case 'NOT_FOUND':
        throw new CharityVolunteerNeedNotFoundException();
      case 'CLOSED':
      case 'FULL':
        throw new CharityVolunteerClosedException();
    }
  }
}

/** Huỷ đăng ký của chính mình — được cả khi sự kiện đang diễn ra (§3.11). */
@Injectable()
export class CancelCharityVolunteerUseCase implements ICancelCharityVolunteerUseCase {
  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICharityVolunteerRegistrationCommand,
  ): Promise<{ cancelled: true }> {
    const cancelled = await this.projects.cancelVolunteer({
      campaignId: command.campaignId,
      volunteerNeedId: command.volunteerNeedId,
      userId: command.userId,
    });
    if (!cancelled) throw new CharityVolunteerRegistrationNotFoundException();
    return { cancelled: true };
  }
}

@Injectable()
export class ConfirmCharityVolunteerUseCase implements IConfirmCharityVolunteerUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(
    command: ICharityVolunteerRegistrationCommand,
  ): Promise<{ confirmed: true }> {
    const { campaign } = await this.access.forOperate(command);
    const confirmed = await this.projects.confirmVolunteer({
      campaignId: campaign.globalId,
      volunteerNeedId: command.volunteerNeedId,
      userId: command.targetUserId ?? '',
      actorId: command.userId,
    });
    if (!confirmed) throw new CharityVolunteerRegistrationNotFoundException();
    return { confirmed: true };
  }
}

/** Nội dung CÔNG KHAI của mục PLAN — chỉ field công khai, không có dữ liệu riêng tư nào. */
async function buildPlanSnapshot(
  projects: ICharityProjectRepository,
  campaignId: string,
): Promise<Record<string, unknown>> {
  const [profile, parties, team, phases, customSections] = await Promise.all([
    projects.getProfile(campaignId),
    projects.listParties(campaignId),
    projects.listTeam(campaignId),
    projects.listPhases(campaignId),
    projects.listCustomSections(campaignId),
  ]);
  return {
    appealPurpose: profile?.appealPurpose ?? null,
    appealAudience: profile?.appealAudience ?? null,
    appealCircumstance: profile?.appealCircumstance ?? null,
    callToActions: profile?.callToActions ?? [],
    // Bên thụ hưởng: chỉ tên và loại — SĐT/địa chỉ của người nhận không lên public.
    parties: parties
      .filter((party) => !party.isAppealSubject)
      .map((party) => ({
        role: party.role,
        name: party.name,
        beneficiaryKind: party.beneficiaryKind,
        address: party.role === 'BENEFICIARY' ? null : party.address,
        hotline: party.role === 'BENEFICIARY' ? null : party.hotline,
        email: party.role === 'BENEFICIARY' ? null : party.email,
      })),
    team: team.map((member) => ({
      role: member.role,
      displayName: member.displayName,
      position: member.position,
      username: member.username,
    })),
    phases: phases.map((phase) => ({
      phase: phase.phase,
      startsAt: phase.startsAt,
      endsAt: phase.endsAt,
      deliveryMethod: phase.deliveryMethod,
      reportMode: phase.reportMode,
      hotline: phase.hotline,
    })),
    customSections: publicCustomSections(customSections, 'PLAN', false),
  };
}

function publicCustomSections(
  sections: ICharityCustomSection[],
  parent: CharityOperationStage,
  isParticipant: boolean,
): unknown[] {
  const visible = (visibility: CharityFieldVisibility) =>
    visibility === 'PUBLIC' || (isParticipant && visibility === 'PARTICIPANT');
  return sections
    .filter(
      (section) =>
        section.parentSection === parent && visible(section.visibility),
    )
    .map((section) => ({
      title: section.title,
      fields: section.fields
        .filter((field) => visible(field.visibility))
        .map((field) => ({
          label: field.label,
          fieldType: field.fieldType,
          value: field.value,
        })),
    }));
}

export async function buildSectionSnapshot(
  projects: ICharityProjectRepository,
  engagement: ICharityEngagementRepository,
  campaignId: string,
  sectionKey: CharityOperationStage,
): Promise<Record<string, unknown> | null> {
  if (sectionKey === 'PLAN') return buildPlanSnapshot(projects, campaignId);
  const custom = publicCustomSections(
    await projects.listCustomSections(campaignId),
    sectionKey,
    false,
  );
  const content: Record<string, unknown> = {};
  if (sectionKey === 'EXECUTION') {
    // Checklist tab B công khai trạng thái, mốc, ghi chú công việc; `remark` là ghi chú nội
    // bộ và người phụ trách là thông tin điều phối — không lên public.
    const tasks = await engagement.listTasks(campaignId);
    if (tasks.length > 0)
      content.tasks = tasks.map((task) => ({
        taskKey: task.taskKey,
        label: CharityTaskLabels[task.taskKey],
        status: task.status,
        scheduledAt: task.scheduledAt,
        workNote: task.workNote,
        updateMode: task.updateMode,
      }));
  }
  if (custom.length > 0) content.customSections = custom;
  return Object.keys(content).length > 0 ? content : null;
}

function sectionViews(
  states: Awaited<ReturnType<ICharityProjectRepository['listSectionStates']>>,
  hasContent: Record<CharityOperationStage, boolean>,
): ICharityProjectSectionView[] {
  return CharityOperationStages.map((sectionKey) => {
    const state = states.find((row) => row.sectionKey === sectionKey);
    const completionStatus: CharitySectionCompletionStatus = state?.publishedAt
      ? 'PUBLISHED'
      : state?.savedAt
        ? 'READY'
        : hasContent[sectionKey]
          ? 'DRAFT'
          : 'EMPTY';
    return {
      sectionKey,
      label: CharityOperationStageLabels[sectionKey],
      completionStatus,
      savedAt: state?.savedAt ?? null,
      publishedAt: state?.publishedAt ?? null,
      updatedBy: state?.updatedBy ?? null,
    };
  });
}

async function sectionContentFlags(
  projects: ICharityProjectRepository,
  engagement: ICharityEngagementRepository,
  campaignId: string,
): Promise<Record<CharityOperationStage, boolean>> {
  const [custom, tasks] = await Promise.all([
    projects.listCustomSections(campaignId),
    engagement.listTasks(campaignId),
  ]);
  const has = (key: CharityOperationStage) =>
    custom.some((section) => section.parentSection === key);
  // Mục Kế hoạch luôn có nội dung — tên, mô tả, thời gian đã có từ lúc tạo.
  return {
    PLAN: true,
    EXECUTION: has('EXECUTION') || tasks.length > 0,
    EVENT: has('EVENT'),
    SUMMARY: has('SUMMARY'),
  };
}

@Injectable()
export class SaveCharitySectionUseCase implements ISaveCharitySectionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: ICharitySectionCommand,
  ): Promise<ICharityProjectSectionView> {
    const { campaign } = await this.access.forEdit(command);
    await this.projects.saveSection({
      campaignId: campaign.globalId,
      sectionKey: command.sectionKey,
      actorId: command.userId,
    });
    const views = sectionViews(
      await this.projects.listSectionStates(campaign.globalId),
      await sectionContentFlags(
        this.projects,
        this.engagement,
        campaign.globalId,
      ),
    );
    return views.find((view) => view.sectionKey === command.sectionKey)!;
  }
}

/**
 * Công khai một mục: chụp nội dung CÔNG KHAI lúc này; public chỉ đọc bản chụp (§3.1). Sửa sau
 * đó không lộ ra public cho tới khi công khai lại.
 */
@Injectable()
export class PublishCharitySectionUseCase implements IPublishCharitySectionUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
  ) {}

  public async handle(
    command: ICharitySectionCommand,
  ): Promise<ICharityProjectSectionView> {
    const { campaign } = await this.access.forEdit(command);
    const snapshot = await buildSectionSnapshot(
      this.projects,
      this.engagement,
      campaign.globalId,
      command.sectionKey,
    );
    if (!snapshot) throw new CharitySectionEmptyException();
    await this.projects.publishSection({
      campaignId: campaign.globalId,
      sectionKey: command.sectionKey,
      actorId: command.userId,
      snapshot,
    });
    const views = sectionViews(
      await this.projects.listSectionStates(campaign.globalId),
      await sectionContentFlags(
        this.projects,
        this.engagement,
        campaign.globalId,
      ),
    );
    return views.find((view) => view.sectionKey === command.sectionKey)!;
  }
}

const UrlPattern = /^https?:\/\/\S+$/;

@Injectable()
export class ReplaceCharityCustomSectionsUseCase implements IReplaceCharityCustomSectionsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IReplaceCharityCustomSectionsCommand) {
    const { campaign } = await this.access.forEdit(command);
    const errors: string[] = [];
    for (const [sectionIndex, section] of command.sections.entries())
      for (const [fieldIndex, field] of section.fields.entries()) {
        const at = `sections[${sectionIndex}].fields[${fieldIndex}]`;
        const value = field.value;
        if (field.fieldType === 'SELECT' && field.options.length === 0)
          errors.push(`${at}.options: SELECT cần ít nhất một lựa chọn`);
        if (value === null || value === undefined || value === '') continue;
        const bad =
          (field.fieldType === 'NUMBER' && typeof value !== 'number') ||
          (field.fieldType === 'CHECKBOX' && typeof value !== 'boolean') ||
          (field.fieldType === 'DATE' &&
            (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) ||
          ((field.fieldType === 'URL' || field.fieldType === 'FILE') &&
            (typeof value !== 'string' || !UrlPattern.test(value))) ||
          (field.fieldType === 'SELECT' &&
            (typeof value !== 'string' || !field.options.includes(value))) ||
          ((field.fieldType === 'TEXT' || field.fieldType === 'LONG_TEXT') &&
            (typeof value !== 'string' ||
              value.length > (field.fieldType === 'TEXT' ? 500 : 5000)));
        if (bad)
          errors.push(`${at}.value: không hợp với kiểu ${field.fieldType}`);
      }
    if (errors.length > 0) throw new ValidationFailedException(errors);
    return this.projects.replaceCustomSections({
      campaignId: campaign.globalId,
      actorId: command.userId,
      sections: command.sections,
    });
  }
}

@Injectable()
export class GetCharityWorkspaceUseCase implements IGetCharityWorkspaceUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
  ) {}

  public async handle(
    command: ICharityProjectCommand,
  ): Promise<ICharityWorkspace> {
    const access = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const { campaign } = access;
    const id = campaign.globalId;
    // Checklist tab B có từ khi dự án được duyệt (§3.4). Tạo ở lượt đọc đầu tiên thay vì ở
    // từng đường duyệt (Admin, công khai ngay, gửi nháp): một chỗ idempotent thay vì ba chỗ
    // phải nhớ.
    if (campaign.approvalStatus === 'APPROVED')
      await this.engagement.ensureTasks({
        campaignId: id,
        schedule: defaultTaskSchedule({
          endTime: campaign.endTime,
          ...(await this.engagement.taskScheduleInputs(id)),
        }),
      });
    if (campaign.approvalStatus === 'APPROVED')
      await this.events.ensureEventSteps(id);
    const [tasks, eventSteps, changedFields, counters] = await Promise.all([
      this.engagement.listTasks(id),
      this.events.listEventSteps(id),
      this.engagement.listChangedFields({ campaignId: id, publicOnly: false }),
      this.engagement.counters(id),
    ]);
    const [
      profile,
      parties,
      bankAccounts,
      beneficiaryBankAccounts,
      team,
      phases,
      itemNeeds,
      fundingNeeds,
      volunteerNeeds,
      volunteerRegistrations,
      stageEvents,
      states,
      customSections,
      contentFlags,
      rehearsal,
    ] = await Promise.all([
      this.projects.getProfile(id),
      this.projects.listParties(id),
      this.projects.listBankAccounts(id),
      this.projects.listBeneficiaryBankAccounts(id),
      this.projects.listTeam(id),
      this.projects.listPhases(id),
      this.projects.listItemNeeds(id),
      this.projects.listFundingNeeds(id),
      this.projects.listVolunteerNeeds(id),
      this.projects.listVolunteerRegistrations(id),
      this.projects.listStageEvents(id),
      this.projects.listSectionStates(id),
      this.projects.listCustomSections(id),
      sectionContentFlags(this.projects, this.engagement, id),
      this.projects.getRehearsal(id),
    ]);
    const now = new Date();
    const suspended = isSuspendedProject(campaign, now);
    const canEdit = (access.isOwner && !suspended) || access.isAdminWriter;
    const canOperate =
      (access.isOwner || access.isCoordinator) && !suspended
        ? true
        : access.isAdminWriter;
    // Người thụ hưởng của kêu gọi cá nhân là dữ liệu RIÊNG TƯ: chỉ chủ dự án và Admin.
    const seesAppealSubject =
      access.isOwner || access.isAdminWriter || access.isAdminReader;
    // Tài khoản của người thụ hưởng kêu gọi cá nhân ẩn cùng dòng của người đó.
    const hiddenPartyIds = new Set(
      seesAppealSubject
        ? []
        : parties.filter((p) => p.isAppealSubject).map((p) => p.partyId),
    );
    return {
      campaign: toView(campaign),
      profile: profile!,
      maxBankAccountsEffective: await this.access.maxBankAccounts(
        id,
        profile?.maxBankAccounts ?? null,
      ),
      parties: seesAppealSubject
        ? parties
        : parties.filter((p) => !p.isAppealSubject),
      bankAccounts,
      beneficiaryBankAccounts: beneficiaryBankAccounts.filter(
        (account) =>
          account.partyId === null || !hiddenPartyIds.has(account.partyId),
      ),
      rehearsal,
      team,
      phases,
      itemNeeds,
      fundingNeeds,
      volunteerNeeds,
      volunteerRegistrations,
      stageEvents,
      sections: sectionViews(states, contentFlags),
      customSections,
      tasks,
      eventSteps: eventSteps.map((step) => ({
        ...step,
        label: CharityEventStepLabels[step.stepKey],
      })),
      changedFields,
      counters,
      capabilities: {
        canEdit,
        canSave: canEdit,
        canPublish: canEdit,
        canSubmit: access.isOwner && campaign.submittedAt === null,
        canAdvanceStage: canOperate && campaign.approvalStatus === 'APPROVED',
        canManageVolunteers: canOperate,
        canUpdateTasks: canOperate && campaign.approvalStatus === 'APPROVED',
        canViewStats: true,
        canExportPdf: true,
        canShare: isPubliclyVisibleProject(campaign, now),
      },
    };
  }
}

/**
 * Bản CÔNG KHAI (§3.12): chỉ dự án đã duyệt và đang hoạt động; mục chưa công khai trả
 * "chưa cập nhật", không lộ nháp. Số liệu nhu cầu là số SỐNG (tiến độ phải đúng lúc xem).
 */
@Injectable()
export class GetCharityPublicProjectUseCase implements IGetCharityPublicProjectUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityEngagementRepository)
    private readonly engagement: ICharityEngagementRepository,
    @Inject(ICharityEventRepository)
    private readonly events: ICharityEventRepository,
    @Inject(ICharitySummaryRepository)
    private readonly summaries: ICharitySummaryRepository,
    @Optional()
    @Inject(ICharityOperationsRepository)
    private readonly operations?: ICharityOperationsRepository,
    @Optional()
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges?: ICharityMoneyPledgeRepository,
  ) {}

  /** Hình thức trao CÔNG KHAI: đúng 5 trường, không bao giờ có chi tiết riêng tư. */
  private async publicDistribution(
    campaignId: string,
  ): Promise<ICharityPublicProject['distribution']> {
    const distribution = await this.operations?.getDistribution(campaignId);
    if (!distribution || distribution.distributionMethod === null) return null;
    return {
      method: distribution.distributionMethod,
      contributionTypes: [...distribution.contributionTypes],
      serviceType: distribution.serviceType,
      serviceChannel: distribution.serviceChannel,
      evidenceUrls: [...distribution.evidenceUrls],
    };
  }

  public async handle(
    command: IGetCharityPublicProjectCommand,
  ): Promise<ICharityPublicProject> {
    // Khác `GET /campaigns/:idOrSlug` cũ: dự án ĐÃ ĐÓNG vẫn hiện — tổng kết là lúc đó (§3.6).
    // Đường cũ giữ nguyên nghĩa (§5).
    const visibleId = await this.projects.findVisibleCampaignId(
      command.idOrSlug,
    );
    const campaign = visibleId
      ? await this.campaigns.findByGlobalId(visibleId)
      : null;
    if (!campaign) throw new CharityCampaignNotFoundException();
    const id = campaign.globalId;
    const [changedFields, counters, isFollowing, eventSteps] =
      await Promise.all([
        this.engagement.listChangedFields({ campaignId: id, publicOnly: true }),
        this.engagement.counters(id),
        command.userId
          ? this.engagement.isFollowing(id, command.userId)
          : Promise.resolve(null),
        this.events.listEventSteps(id),
      ]);
    const [summary, supporters] = await Promise.all([
      this.summaries.getSummary(id),
      this.summaries.publicSupporters(id, MaxPublicSupporterNames),
    ]);
    const publishedSummary = summary?.publishedAt ? summary : null;
    const [financialReports, totals] = publishedSummary
      ? await Promise.all([
          this.summaries.listFinancialReports(id),
          this.summaries.intakeTotals(id),
        ])
      : [[], null];
    const publicTotals =
      totals && !campaign.acceptedContributionTypes.includes('MONEY')
        ? { ...totals, money: null }
        : totals;
    const [
      profile,
      states,
      bankAccounts,
      itemNeeds,
      fundingNeeds,
      volunteerNeeds,
      mine,
    ] = await Promise.all([
      this.projects.getProfile(id),
      this.projects.listSectionStates(id),
      this.projects.listBankAccounts(id),
      this.projects.listItemNeeds(id),
      this.projects.listFundingNeeds(id),
      this.projects.listVolunteerNeeds(id),
      command.userId
        ? this.projects.findMyVolunteerRegistrations(id, command.userId)
        : Promise.resolve(null),
    ]);
    const beforeEvent = stageRank(campaign.operationStage) < stageRank('EVENT');
    const acceptsMoney = campaign.acceptedContributionTypes.includes('MONEY');
    // Lời khai ủng hộ tiền (CR 25/11/2026): dòng số RIÊNG, không cộng vào số thực nhận.
    const pledgeTotals =
      acceptsMoney && this.pledges ? await this.pledges.totals(id) : null;
    return {
      campaign: { ...campaign, isJoined: null },
      appealPurpose: profile?.appealPurpose ?? null,
      appealAudience: profile?.appealAudience ?? null,
      appealCircumstance: profile?.appealCircumstance ?? null,
      callToActions: profile?.callToActions ?? [],
      sections: CharityOperationStages.map((sectionKey) => {
        const state = states.find((row) => row.sectionKey === sectionKey);
        return {
          sectionKey,
          label: CharityOperationStageLabels[sectionKey],
          published: Boolean(state?.publishedAt),
          publishedAt: state?.publishedAt ?? null,
          content: state?.publishedAt ? state.publishedSnapshot : null,
        };
      }),
      // Chỉ tài khoản ĐANG hiệu lực: người chuyển khoản không được thấy số tài khoản đã đóng.
      bankAccounts: campaign.acceptedContributionTypes.includes('MONEY')
        ? bankAccounts.filter((account) => account.validTo === null)
        : [],
      itemNeeds: itemNeeds
        .filter((need) => need.isActive)
        // Người nhận hàng là thông tin điều phối, không công khai.
        .map((need) => ({ ...need, receiverName: null, receiverPhone: null })),
      fundingNeeds: acceptsMoney
        ? fundingNeeds.map((need) => {
            const pledged = pledgeTotals?.byFundingNeed.find(
              (row) => row.fundingNeedId === need.fundingNeedId,
            );
            return {
              ...need,
              pledgedAmount: pledged?.pledgedAmount ?? 0,
              pledgeCount: pledged?.pledgeCount ?? 0,
            };
          })
        : [],
      moneyPledges: acceptsMoney
        ? {
            pledgedAmount: pledgeTotals?.pledgedAmount ?? 0,
            pledgeCount: pledgeTotals?.pledgeCount ?? 0,
          }
        : null,
      volunteerNeeds,
      myVolunteerRegistrations: mine,
      changedFields,
      eventSteps: eventSteps.map((step) => ({
        ...step,
        label: CharityEventStepLabels[step.stepKey],
      })),
      summary: publishedSummary,
      financialReports,
      totals: publicTotals,
      distribution: await this.publicDistribution(campaign.globalId),
      beneficiaries: (await this.campaigns.listBeneficiaryPlans(id)).map(
        toPublicBeneficiary,
      ),
      organizer: await publicOrganizer(this.campaigns, id),
      supporters,
      counters,
      isFollowing,
      capabilities: {
        canJoinVolunteer:
          Boolean(command.userId) &&
          beforeEvent &&
          volunteerNeeds.some(
            (need) => need.status === 'OPEN' && need.remainingCount > 0,
          ),
        canContribute:
          Boolean(command.userId) && campaign.operationStage === 'EXECUTION',
        canReport: Boolean(command.userId),
        canFollow: Boolean(command.userId) && campaign.isActive,
        canComment: Boolean(command.userId),
      },
    };
  }
}

@Injectable()
export class SetCharityLimitsUseCase implements ISetCharityLimitsUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: ISetCharityLimitsCommand) {
    if (!(await this.admin.hasPermission(command.userId, WritePermission)))
      throw new CharityProjectForbiddenException();
    const found = await this.projects.setMaxBankAccounts({
      campaignId: command.campaignId,
      actorId: command.userId,
      maxBankAccounts: command.maxBankAccounts,
      reason: command.reason.trim(),
    });
    if (!found) throw new CharityCampaignNotFoundException();
    return {
      maxBankAccounts: command.maxBankAccounts,
      maxBankAccountsEffective: await this.access.maxBankAccounts(
        command.campaignId,
        command.maxBankAccounts,
      ),
    };
  }
}

/** Ảnh chụp các trường cần duyệt của bản ĐANG CHẠY (đã duyệt) — `base` của bản sửa. */
async function reviewedSnapshot(
  projects: ICharityProjectRepository,
  campaign: ICharityCampaign,
): Promise<ICharityReviewedFields> {
  const cover = campaign.media.find((item) => item.isCover);
  return {
    title: campaign.title,
    description: campaign.description,
    // Bản chụp chỉ để Admin so — media đang chạy được nhận diện bằng URL công khai.
    media: {
      keys: campaign.media.map((item) => item.url),
      coverKey: cover?.url ?? campaign.bannerUrl,
    },
    beneficiaries: (await projects.listParties(campaign.globalId))
      .filter((party) => party.role === 'BENEFICIARY' && !party.isAppealSubject)
      .map((party) => ({
        partyId: party.partyId,
        name: party.name,
        beneficiaryKind: party.beneficiaryKind ?? 'GROUP',
        estimatedPortions: party.estimatedPortions,
        estimatedAmount: party.estimatedAmount,
        address: party.address ?? null,
        distributionAt: party.distributionAt
          ? party.distributionAt.toISOString()
          : null,
        lat: party.location?.lat ?? null,
        lng: party.location?.lng ?? null,
      })),
    acceptedContributionTypes: [...campaign.acceptedContributionTypes],
    pointBonusPercent: campaign.pointBonusPercent,
  };
}

/** Workspace (chủ, điều phối, Admin đọc) xem bản sửa đang chờ duyệt. */
@Injectable()
export class GetCharityChangeRequestUseCase implements IGetCharityChangeRequestUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign } = await this.access.forOperate(command);
    return {
      request: await this.changeRequests.findPending(campaign.globalId),
    };
  }
}

/**
 * Gửi bản sửa chờ duyệt (CR 22/11/2026 §3.17): chỉ chiến dịch ĐÃ DUYỆT; chỉ khoá được gửi và
 * khác bản đang chạy. Media xác nhận với R2 ngay (key hỏng → 400) nhưng chỉ gắn khi Admin
 * duyệt. Gửi lại khi đang chờ thì thay nội dung, giữ `base` lần đầu.
 */
@Injectable()
export class SaveCharityChangeRequestUseCase implements ISaveCharityChangeRequestUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(command: ISaveCharityChangeRequestCommand) {
    const { campaign } = await this.access.forEdit(command);
    if (campaign.approvalStatus !== 'APPROVED')
      throw new CharityProjectNotApprovedException();
    const input = command.revision ?? {};
    const proposed: ICharityReviewedFields = {};
    const errors: string[] = [];
    if (input.title !== undefined) proposed.title = input.title.trim();
    if (input.description !== undefined)
      proposed.description = input.description.trim();
    if (input.acceptedContributionTypes !== undefined)
      proposed.acceptedContributionTypes = normalizeContributionTypes(
        input.acceptedContributionTypes,
      );
    if (input.pointBonusPercent !== undefined) {
      if (isCharityPointBonusPercent(input.pointBonusPercent))
        proposed.pointBonusPercent = input.pointBonusPercent;
      else
        errors.push(
          `revision.pointBonusPercent phải là một trong: ${CharityPointBonusPercents.join(', ')}`,
        );
    }
    if (input.beneficiaries !== undefined) {
      // Cùng trần với PUT :id/parties (review M3).
      const max = await this.access.maxBeneficiaries();
      if (input.beneficiaries.length > max)
        errors.push(
          `revision.beneficiaries: tối đa ${max} đơn vị nhận (charity.max_beneficiaries_per_campaign)`,
        );
    }
    if (input.beneficiaries !== undefined)
      proposed.beneficiaries = input.beneficiaries.map((unit) => ({
        ...(unit.partyId ? { partyId: unit.partyId } : {}),
        name: unit.name.trim(),
        beneficiaryKind: unit.beneficiaryKind,
        estimatedPortions: unit.estimatedPortions,
        estimatedAmount: unit.estimatedAmount,
        address: unit.address?.trim() || null,
        distributionAt: unit.distributionAt ?? null,
        lat: unit.lat ?? null,
        lng: unit.lng ?? null,
      }));
    if (errors.length > 0) throw new ValidationFailedException(errors);
    if (input.media !== undefined) {
      // Xác nhận key với R2 lúc gửi — key hỏng trả 400 ngay, không đợi tới lúc Admin duyệt.
      await confirmCharityMedia(
        this.storage,
        command.userId,
        input.media.keys,
        input.media.coverKey,
      );
      proposed.media = {
        keys: [...input.media.keys],
        coverKey: input.media.coverKey,
      };
    }
    const base = await reviewedSnapshot(this.projects, campaign);
    if (reviewedFieldsChanged(base, proposed).length === 0)
      throw new ValidationFailedException([
        'revision: không có thay đổi nào so với bản đã duyệt',
      ]);
    return {
      request: await this.changeRequests.upsertPending({
        campaignId: campaign.globalId,
        actorId: command.userId,
        proposed,
        base,
      }),
    };
  }
}

/** Chủ dự án rút bản sửa đang chờ; không có bản chờ → 404. */
@Injectable()
export class WithdrawCharityChangeRequestUseCase implements IWithdrawCharityChangeRequestUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
  ) {}

  public async handle(command: ICharityProjectCommand) {
    const { campaign, isOwner } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    if (!isOwner) throw new CharityProjectForbiddenException();
    if (
      !(await this.changeRequests.withdraw({
        campaignId: campaign.globalId,
        actorId: command.userId,
      }))
    )
      throw new CharityCampaignNotFoundException();
    return { withdrawn: true as const };
  }
}

/** Bộ party THAY THẾ khi áp bản sửa: giữ mọi vai khác, thay đơn vị nhận theo bản sửa. */
function mergeReviewedBeneficiaries(
  current: readonly ICharityParty[],
  proposed: readonly ICharityReviewedBeneficiary[],
): ICharityPartyInput[] {
  const byId = new Map(current.map((party) => [party.partyId, party]));
  const others = current
    .filter((party) => !party.isAppealSubject && party.role !== 'BENEFICIARY')
    .map((party): ICharityPartyInput => ({ ...party }));
  const beneficiaries = proposed.map((unit): ICharityPartyInput => {
    const previous = unit.partyId ? byId.get(unit.partyId) : undefined;
    const kept = previous && previous.role === 'BENEFICIARY' ? previous : null;
    return {
      partyId: kept?.partyId ?? null,
      role: 'BENEFICIARY',
      name: unit.name,
      beneficiaryKind: unit.beneficiaryKind,
      estimatedPortions: unit.estimatedPortions,
      estimatedAmount: unit.estimatedAmount,
      address:
        unit.address !== undefined
          ? (unit.address ?? null)
          : (kept?.address ?? null),
      distributionAt:
        unit.distributionAt !== undefined
          ? unit.distributionAt
            ? new Date(unit.distributionAt)
            : null
          : (kept?.distributionAt ?? null),
      lat: unit.lat !== undefined ? (unit.lat ?? null) : (kept?.lat ?? null),
      lng: unit.lng !== undefined ? (unit.lng ?? null) : (kept?.lng ?? null),
      phone: kept?.phone ?? null,
      email: kept?.email ?? null,
      hotline: kept?.hotline ?? null,
      picName: kept?.picName ?? null,
      picPhone: kept?.picPhone ?? null,
      picUserId: kept?.picUserId ?? null,
      evidenceUrls: kept?.evidenceUrls ?? [],
      consentStatus: kept?.consentStatus ?? null,
    };
  });
  return [...others, ...beneficiaries];
}

const ChangeRequestReadPermission = 'campaign.read';
const ChangeRequestWritePermission = 'campaign.manage';

/** Hàng đợi bản sửa cho Admin (`campaign.read`). */
@Injectable()
export class ListCharityChangeRequestsUseCase implements IListCharityChangeRequestsUseCase {
  public constructor(
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IListCharityChangeRequestsCommand) {
    if (
      !(await this.admin.hasPermission(
        command.actorUserId,
        ChangeRequestReadPermission,
      ))
    )
      throw new ForbiddenException();
    return {
      requests: await this.changeRequests.listByStatus({
        status: command.status,
        limit: Math.min(Math.max(command.limit, 1), 100),
        offset: Math.max(command.offset, 0),
      }),
    };
  }
}

/** Admin xem bản sửa đang chờ cạnh giá trị ĐANG CHẠY của chiến dịch. */
@Injectable()
export class GetAdminCharityChangeRequestUseCase implements IGetAdminCharityChangeRequestUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IAdminCharityChangeRequestCommand) {
    if (
      !(await this.admin.hasPermission(
        command.actorUserId,
        ChangeRequestReadPermission,
      ))
    )
      throw new ForbiddenException();
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    const request = await this.changeRequests.findPending(campaign.globalId);
    if (!request) throw new CharityCampaignNotFoundException();
    return {
      request,
      current: await reviewedSnapshot(this.projects, campaign),
    };
  }
}

/**
 * Admin duyệt hoặc từ chối bản sửa (CR 22/11/2026).
 *
 * Duyệt: kiểm sàn số suất/tiền và khung trao với bộ đơn vị đề xuất TRƯỚC (vi phạm → 400, bản sửa
 * vẫn chờ), xác nhận media, rồi áp trong một transaction. Từ chối: bắt buộc lý do, không áp gì.
 * Cả hai ghi audit Admin và báo chủ dự án.
 */
@Injectable()
export class DecideCharityChangeRequestUseCase implements IDecideCharityChangeRequestUseCase {
  private readonly logger = new Logger(DecideCharityChangeRequestUseCase.name);

  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityChangeRequestRepository)
    private readonly changeRequests: ICharityChangeRequestRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    // `@Optional()`: cây CLI dựng CharityProjectModule mà không có CharityCampaignModule (nơi
    // export notifier) — CLI không bao giờ duyệt bản sửa. Ở API notifier luôn có.
    @Optional() private readonly notifier?: CharityNotifier,
  ) {}

  public async handle(command: IDecideCharityChangeRequestCommand) {
    if (
      !(await this.admin.hasPermission(
        command.actorUserId,
        ChangeRequestWritePermission,
      ))
    )
      throw new ForbiddenException();
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign) throw new CharityCampaignNotFoundException();
    const request = await this.changeRequests.findPending(campaign.globalId);
    if (!request) throw new CharityCampaignNotFoundException();
    const reason = command.reason?.trim() || null;

    if (!command.approve) {
      if (!reason)
        throw new ValidationFailedException([
          'decision.reason: bắt buộc khi từ chối',
        ]);
      const decided = await this.changeRequests.decide({
        requestId: request.requestId,
        actorId: command.actorUserId,
        status: 'REJECTED',
        reason,
      });
      if (!decided) throw new CharityCampaignNotFoundException();
      await this.finish(campaign, decided, command.actorUserId, false, reason);
      return { request: decided };
    }

    const proposed = request.proposed;
    if (proposed.beneficiaries) {
      // Sàn và khung trao với bộ đơn vị ĐỀ XUẤT — vi phạm thì bản sửa vẫn chờ.
      await assertCampaignPortionFloors(this.projects, campaign, {
        plans: proposed.beneficiaries.map((unit) => ({
          estimatedPortions: unit.estimatedPortions,
          estimatedAmount: unit.estimatedAmount,
        })),
      });
      // Mọi đơn vị trong bộ đề xuất — kể cả đơn vị đang có bị dời giờ trao (review I4).
      await assertBeneficiariesInsideWindow(
        this.projects,
        campaign.globalId,
        campaign.distribution,
        proposed.beneficiaries.map((unit) => ({
          name: unit.name,
          distributionAt: unit.distributionAt
            ? new Date(unit.distributionAt)
            : null,
        })),
      );
    }
    if (proposed.beneficiaries) {
      // Cùng luật với PUT :id/parties: không bỏ đơn vị còn tài khoản thụ hưởng đang hiệu lực —
      // tài khoản đã xác thực sẽ mồ côi (review I3). Bản sửa vẫn chờ.
      const kept = new Set(
        proposed.beneficiaries
          .map((unit) => unit.partyId)
          .filter((id): id is string => Boolean(id)),
      );
      const [current, accounts] = await Promise.all([
        this.projects.listParties(campaign.globalId),
        this.projects.listBeneficiaryBankAccounts(campaign.globalId),
      ]);
      const blocked = current.filter(
        (party) =>
          party.role === 'BENEFICIARY' &&
          !party.isAppealSubject &&
          !kept.has(party.partyId) &&
          accounts.some(
            (account) =>
              account.partyId === party.partyId && account.validTo === null,
          ),
      );
      if (blocked.length > 0)
        throw new ValidationFailedException(
          blocked.map(
            (party) =>
              `revision.beneficiaries: đơn vị "${party.name}" còn tài khoản thụ hưởng đang hiệu lực — đóng tài khoản trước`,
          ),
        );
    }
    const media = proposed.media
      ? await confirmCharityMedia(
          this.storage,
          request.submittedBy ?? campaign.createdBy ?? command.actorUserId,
          proposed.media.keys,
          proposed.media.coverKey,
        )
      : null;
    const decided = await this.changeRequests.applyApproved({
      request,
      actorId: command.actorUserId,
      reason,
      campaign: {
        title: proposed.title,
        description: proposed.description,
        pointBonusPercent: proposed.pointBonusPercent,
        acceptedContributionTypes: proposed.acceptedContributionTypes,
      },
      media,
      parties: proposed.beneficiaries
        ? mergeReviewedBeneficiaries(
            await this.projects.listParties(campaign.globalId),
            proposed.beneficiaries,
          )
        : null,
    });
    if (!decided) throw new CharityCampaignNotFoundException();
    await this.finish(campaign, decided, command.actorUserId, true, reason);
    return { request: decided };
  }

  private async finish(
    campaign: ICharityCampaign,
    request: ICharityChangeRequest,
    actorId: string,
    approved: boolean,
    reason: string | null,
  ): Promise<void> {
    // Bản sửa đã được áp/chốt: audit hỏng lúc này không được biến thành lỗi trả về (Admin bấm
    // lại sẽ nhận 404 vì bản sửa không còn chờ) — ghi log để vận hành bù (review M4).
    try {
      await this.admin.appendAudit({
        actorUserId: actorId,
        action: approved
          ? 'CHARITY_CHANGE_REQUEST_APPROVE'
          : 'CHARITY_CHANGE_REQUEST_REJECT',
        resourceType: 'CAMPAIGN',
        resourceId: campaign.globalId,
        before: request.base,
        after: request.proposed,
        reason: reason ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Không ghi được audit bản sửa ${request.requestId}: ${String(error)}`,
      );
    }
    await this.notifier?.changeRequestDecided({
      campaignId: campaign.globalId,
      campaignTitle: campaign.title,
      ownerId: campaign.createdBy,
      requestId: request.requestId,
      approved,
      reason,
    });
  }
}
