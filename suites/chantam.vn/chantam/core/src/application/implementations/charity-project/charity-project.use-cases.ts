import { ICharityCampaignView } from '@/application/contracts/charity-campaign';
import {
  IAddCharityBankAccountCommand,
  IAddCharityBankAccountUseCase,
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
  IConfirmCharityVolunteerUseCase,
  IGetCharityPublicProjectCommand,
  IGetCharityPublicProjectUseCase,
  IGetCharityWorkspaceUseCase,
  IMoveCharityStageCommand,
  IMoveCharityStageUseCase,
  IPublishCharitySectionUseCase,
  IRegisterCharityVolunteerUseCase,
  IReplaceCharityCustomSectionsCommand,
  IReplaceCharityCustomSectionsUseCase,
  IReplaceCharityPartiesCommand,
  IReplaceCharityPartiesUseCase,
  IReplaceCharityPhasesCommand,
  IReplaceCharityPhasesUseCase,
  IReplaceCharityTeamCommand,
  IReplaceCharityTeamUseCase,
  ISaveCharityFundingNeedCommand,
  ISaveCharityFundingNeedUseCase,
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
} from '@/application/contracts/charity-project';
import {
  CharityBankAccountLimitException,
  CharityBankAccountNotFoundException,
  CharityCampaignNotFoundException,
  CharityFundingNeedNotFoundException,
  CharityNeedItemInvalidException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotDraftException,
  CharitySectionEmptyException,
  CharityStageScheduleConflictException,
  CharityStageTransitionInvalidException,
  CharityVolunteerClosedException,
  CharityVolunteerNeedNotFoundException,
  CharityVolunteerNotEligibleException,
  CharityVolunteerRegistrationNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICharityCampaign,
  ICharityCampaignRepository,
  ICharityCustomSection,
  ICharityProjectRepository,
  IEntitlementRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  CharityFieldVisibility,
  CharityMaxBankAccountsConfigKey,
  CharityOperationStage,
  CharityOperationStageLabels,
  CharityOperationStages,
  CharitySectionCompletionStatus,
  effectiveOperationStage,
  normalizeMaxBankAccounts,
  phaseScheduleGaps,
  stageRank,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { resolveCharityApprovalStatus } from '../charity-campaign/charity-campaign.use-cases';

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
  ) {}

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
    if (!access.campaign.isActive && !access.isAdminWriter)
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
    if (!access.campaign.isActive && !access.isAdminWriter)
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
@Injectable()
export class MoveCharityStageUseCase implements IMoveCharityStageUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
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
    const reason = trimmed(command.reason);
    if (!forward) {
      if (!reason)
        throw new CharityStageTransitionInvalidException(
          'quay lại phải có lý do',
        );
      const wouldBe = effectiveOperationStage({
        stored: command.to,
        distribution: campaign.distribution,
        endTime: campaign.endTime,
        now: new Date(),
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
    return toView(
      (await this.campaigns.findByGlobalId(
        campaign.globalId,
      )) as ICharityCampaign,
    );
  }
}

/** Job ngoài tiến trình `charity:advance-stage` — ghi xuống giai đoạn đã tới mốc. */
@Injectable()
export class AdvanceCharityStagesUseCase implements IAdvanceCharityStagesUseCase {
  private readonly logger = new Logger(AdvanceCharityStagesUseCase.name);

  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: {
    limit: number;
    dryRun: boolean;
  }): Promise<{ advanced: number; checked: number }> {
    const candidates = await this.projects.listStageCandidates(command.limit);
    let advanced = 0;
    for (const candidate of candidates) {
      const target = effectiveOperationStage({
        stored: candidate.stored,
        distribution: candidate.distribution,
        endTime: candidate.endTime,
        now: new Date(),
      });
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
    return { advanced, checked: candidates.length };
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
    const { campaign } = await this.access.forEdit(command);
    const current = await this.projects.getProfile(campaign.globalId);
    if (!current) throw new CharityCampaignNotFoundException();
    // Bỏ trống = giữ nguyên; `null` = xoá.
    const pick = (value: string | null | undefined, previous: string | null) =>
      value === undefined ? previous : trimmed(value);
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
    const { campaign } = await this.access.forEdit(command);
    const errors: string[] = [];
    for (const [index, party] of command.parties.entries()) {
      if ((party.role === 'BENEFICIARY') !== (party.beneficiaryKind !== null))
        errors.push(
          `parties[${index}].beneficiaryKind: bắt buộc với BENEFICIARY, bỏ trống với vai khác`,
        );
      if (party.evidenceUrls.some((url) => !/^https:\/\//.test(url)))
        errors.push(`parties[${index}].evidenceUrls: phải là URL https`);
    }
    if (errors.length > 0) throw new ValidationFailedException(errors);
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

@Injectable()
export class AddCharityBankAccountUseCase implements IAddCharityBankAccountUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
  ) {}

  public async handle(command: IAddCharityBankAccountCommand) {
    const { campaign } = await this.access.forEdit(command);
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
    return this.projects.replacePhases({
      campaignId: campaign.globalId,
      actorId: command.userId,
      phases: command.phases,
    });
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
    const updated = await this.projects.updateItemNeedProfile({
      campaignId: campaign.globalId,
      needItemId: command.needItemId,
      profile: command.profile,
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
      receivingUnit: trimmed(need.receivingUnit),
    };

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
    if (
      !campaign ||
      campaign.approvalStatus !== 'APPROVED' ||
      !campaign.isActive
    )
      throw new CharityCampaignNotFoundException();
    if (stageRank(campaign.operationStage) >= stageRank('EVENT'))
      throw new CharityVolunteerClosedException();
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
      case 'NOT_ELIGIBLE':
        throw new CharityVolunteerNotEligibleException();
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

async function buildSectionSnapshot(
  projects: ICharityProjectRepository,
  campaignId: string,
  sectionKey: CharityOperationStage,
): Promise<Record<string, unknown> | null> {
  if (sectionKey === 'PLAN') return buildPlanSnapshot(projects, campaignId);
  // Đợt 1: mục B/C/D chỉ có form mở; checklist, timeline, tổng kết đến ở các đợt sau.
  const custom = publicCustomSections(
    await projects.listCustomSections(campaignId),
    sectionKey,
    false,
  );
  return custom.length > 0 ? { customSections: custom } : null;
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
  campaignId: string,
): Promise<Record<CharityOperationStage, boolean>> {
  const custom = await projects.listCustomSections(campaignId);
  const has = (key: CharityOperationStage) =>
    custom.some((section) => section.parentSection === key);
  // Mục Kế hoạch luôn có nội dung — tên, mô tả, thời gian đã có từ lúc tạo.
  return {
    PLAN: true,
    EXECUTION: has('EXECUTION'),
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
      await sectionContentFlags(this.projects, campaign.globalId),
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
  ) {}

  public async handle(
    command: ICharitySectionCommand,
  ): Promise<ICharityProjectSectionView> {
    const { campaign } = await this.access.forEdit(command);
    const snapshot = await buildSectionSnapshot(
      this.projects,
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
      await sectionContentFlags(this.projects, campaign.globalId),
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
    const [
      profile,
      parties,
      bankAccounts,
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
    ] = await Promise.all([
      this.projects.getProfile(id),
      this.projects.listParties(id),
      this.projects.listBankAccounts(id),
      this.projects.listTeam(id),
      this.projects.listPhases(id),
      this.projects.listItemNeeds(id),
      this.projects.listFundingNeeds(id),
      this.projects.listVolunteerNeeds(id),
      this.projects.listVolunteerRegistrations(id),
      this.projects.listStageEvents(id),
      this.projects.listSectionStates(id),
      this.projects.listCustomSections(id),
      sectionContentFlags(this.projects, id),
    ]);
    const canEdit =
      (access.isOwner && campaign.isActive) || access.isAdminWriter;
    const canOperate =
      (access.isOwner || access.isCoordinator) && campaign.isActive
        ? true
        : access.isAdminWriter;
    // Người thụ hưởng của kêu gọi cá nhân là dữ liệu RIÊNG TƯ: chỉ chủ dự án và Admin.
    const seesAppealSubject =
      access.isOwner || access.isAdminWriter || access.isAdminReader;
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
      team,
      phases,
      itemNeeds,
      fundingNeeds,
      volunteerNeeds,
      volunteerRegistrations,
      stageEvents,
      sections: sectionViews(states, contentFlags),
      customSections,
      capabilities: {
        canEdit,
        canSave: canEdit,
        canPublish: canEdit,
        canSubmit: access.isOwner && campaign.submittedAt === null,
        canAdvanceStage: canOperate && campaign.approvalStatus === 'APPROVED',
        canManageVolunteers: canOperate,
        // In PDF đến ở đợt 2 (§3.13).
        canExportPdf: false,
        canShare: campaign.approvalStatus === 'APPROVED' && campaign.isActive,
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
  ) {}

  public async handle(
    command: IGetCharityPublicProjectCommand,
  ): Promise<ICharityPublicProject> {
    const campaign = await this.campaigns.findPublicByIdOrSlug(
      command.idOrSlug,
    );
    if (!campaign) throw new CharityCampaignNotFoundException();
    const id = campaign.globalId;
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
      bankAccounts: bankAccounts.filter((account) => account.validTo === null),
      itemNeeds: itemNeeds
        .filter((need) => need.isActive)
        // Người nhận hàng là thông tin điều phối, không công khai.
        .map((need) => ({ ...need, receiverName: null, receiverPhone: null })),
      fundingNeeds,
      volunteerNeeds,
      myVolunteerRegistrations: mine,
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
