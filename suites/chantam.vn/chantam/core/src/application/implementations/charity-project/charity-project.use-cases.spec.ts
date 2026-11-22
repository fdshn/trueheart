import {
  CharityBankAccountLimitException,
  CharityBankAccountNotFoundException,
  CharityBeneficiaryAccountNameMismatchException,
  CharityBeneficiaryAccountNotVerifiedException,
  CharityCampaignNotFoundException,
  CharityContributionTypeDisabledException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotDraftException,
  CharityRehearsalNotReadyException,
  CharityRoundEvidenceRequiredException,
  CharitySectionEmptyException,
  CharityStageScheduleConflictException,
  CharityStageTransitionInvalidException,
  CharitySubmitRequirementsUnmetException,
  CharityVolunteerClosedException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  AddCharityBankAccountUseCase,
  AddCharityBeneficiaryBankAccountUseCase,
  AdvanceCharityStagesUseCase,
  CharityProjectAccess,
  CloseCharityBeneficiaryBankAccountUseCase,
  GetCharityPublicProjectUseCase,
  GetCharityWorkspaceUseCase,
  MoveCharityStageUseCase,
  PublishCharitySectionUseCase,
  RegisterCharityVolunteerUseCase,
  ReplaceCharityCustomSectionsUseCase,
  ReplaceCharityPartiesUseCase,
  ReplaceCharityPhasesUseCase,
  SaveCharityFundingNeedUseCase,
  SaveCharityRehearsalUseCase,
  SubmitCharityProjectUseCase,
  UpdateCharityProfileUseCase,
  VerifyCharityBeneficiaryBankAccountUseCase,
} from './charity-project.use-cases';

const Owner = '10000000-0000-4000-8000-000000000001';
const Coordinator = '10000000-0000-4000-8000-000000000002';
const Stranger = '10000000-0000-4000-8000-000000000003';
const CampaignId = '20000000-0000-4000-8000-000000000001';
const Hour = 3_600_000;

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    slug: 'mua-dong-am',
    description: 'Trao áo ấm cho trẻ em vùng cao.',
    bannerUrl: 'https://cdn.test/a.jpg',
    badgeName: 'Ấm áp',
    targetItemsCount: 0,
    currentItemsCount: 0,
    progressPercent: null,
    lat: null,
    lng: null,
    locationLabel: null,
    startTime: new Date(Date.now() - Hour),
    endTime: new Date(Date.now() + 30 * 24 * Hour),
    isActive: true,
    approvalStatus: 'APPROVED',
    approvalNote: null,
    approvedAt: new Date(),
    approvedBy: 'admin',
    createdBy: Owner,
    createdAt: new Date(),
    updatedAt: new Date(),
    participantCount: 0,
    media: [],
    campaignType: 'ORGANIZED_CAMPAIGN',
    acceptedContributionTypes: ['MATERIAL', 'MONEY', 'SERVICE'],
    beneficiaryRelation: null,
    allowOverTarget: false,
    minimumParticipants: 0,
    minimumParticipantRank: null,
    submittedAt: new Date(),
    operationStage: 'EXECUTION',
    storedOperationStage: 'EXECUTION',
    distribution: null,
    summaryPublishedAt: null,
    ...overrides,
  };
}

function make(
  options: {
    campaign?: ICharityCampaign | null;
    coordinator?: boolean;
    adminWrite?: boolean;
    adminRead?: boolean;
    capability?: { publishNow: boolean };
  } = {},
) {
  const current =
    options.campaign === undefined ? campaign() : options.campaign;
  const campaigns = {
    findByGlobalId: jest.fn(async () => current),
    findPublicByIdOrSlug: jest.fn(async () => current),
    isCampaignManager: jest.fn(async () => options.coordinator ?? false),
    findBeneficiary: jest.fn(async () => null),
  };
  const admin = {
    hasPermission: jest.fn(async (_user: string, permission: string) =>
      permission === 'campaign.manage'
        ? (options.adminWrite ?? false)
        : (options.adminRead ?? false),
    ),
    getConfigValue: jest.fn(async () => 2),
  };
  const projects = {
    getProfile: jest.fn(async () => ({
      appealPurpose: null,
      appealAudience: null,
      appealCircumstance: null,
      callToActions: [],
      acceptedContributionTypes: [],
      maxBankAccounts: null,
    })),
    updateProfile: jest.fn(async (..._args: unknown[]) => undefined),
    submitDraft: jest.fn(async (..._args: unknown[]) => 'SUBMITTED'),
    intakeCounts: jest.fn(async () => ({
      openMaterialNeeds: 1,
      openFundingNeeds: 1,
      openSupportNeeds: 1,
      liveBankAccounts: 1,
    })),
    moveStage: jest.fn(async (..._args: unknown[]) => 'MOVED'),
    getRehearsal: jest.fn(async (): Promise<unknown> => ({
      campaignId: CampaignId,
      checklist: [],
      outcome: 'READY',
      reason: null,
      note: null,
      decidedBy: Owner,
      decidedAt: new Date(),
      phase: null,
    })),
    saveRehearsal: jest.fn(async (params: Record<string, unknown>) => ({
      campaignId: CampaignId,
      ...params,
    })),
    distributionSettlement: jest.fn(async (): Promise<unknown> => ({
      method: null,
      evidenceUrls: [],
      trackingCode: null,
      beneficiaryAccount: null,
    })),
    listStageCandidates: jest.fn(async () => [] as unknown[]),
    listBlockedStageCampaigns: jest.fn(async () => [] as unknown[]),
    listOverdueSummaries: jest.fn(async () => [] as unknown[]),
    listParties: jest.fn(async () => [
      {
        partyId: 'p1',
        role: 'BENEFICIARY',
        isAppealSubject: true,
        name: 'Bà A',
        address: 'Hẻm 1',
        phone: '09',
        email: null,
        hotline: null,
        beneficiaryKind: 'INDIVIDUAL',
      },
      {
        partyId: 'p2',
        role: 'ORGANIZER',
        isAppealSubject: false,
        name: 'CLB B',
        address: 'Số 2',
        phone: '08',
        email: 'b@x.vn',
        hotline: '1900',
        beneficiaryKind: null,
      },
    ]),
    replaceParties: jest.fn(async (..._args: unknown[]) => []),
    listBankAccounts: jest.fn(async () => [
      {
        accountId: 'b1',
        validTo: null,
        bankName: 'VCB',
        accountNo: '0123',
        accountName: 'CLB',
        label: null,
        validFrom: new Date(),
        closeReason: null,
      },
      {
        accountId: 'b0',
        validTo: new Date(),
        bankName: 'ACB',
        accountNo: '9999',
        accountName: 'Cũ',
        label: null,
        validFrom: new Date(),
        closeReason: 'đổi',
      },
    ]),
    addBankAccount: jest.fn(async (..._args: unknown[]) => ({
      status: 'LIMIT_REACHED',
      limit: 2,
    })),
    listTeam: jest.fn(async () => []),
    listPhases: jest.fn(async () => []),
    replacePhases: jest.fn(async (..._args: unknown[]) => []),
    listItemNeeds: jest.fn(async () => [
      {
        needItemId: 'n1',
        isActive: true,
        receiverName: 'Anh C',
        receiverPhone: '0901',
      },
    ]),
    listFundingNeeds: jest.fn(async () => []),
    createFundingNeed: jest.fn(async () => ({})),
    updateFundingNeed: jest.fn(async () => ({})),
    listVolunteerNeeds: jest.fn(async () => [
      { volunteerNeedId: 'v1', status: 'OPEN', remainingCount: 3 },
    ]),
    listVolunteerRegistrations: jest.fn(async () => []),
    findMyVolunteerRegistrations: jest.fn(async () => []),
    registerVolunteer: jest.fn(async (..._args: unknown[]) => 'REGISTERED'),
    listStageEvents: jest.fn(async () => []),
    listSectionStates: jest.fn(async () => [] as unknown[]),
    listCustomSections: jest.fn(async () => [] as unknown[]),
    publishSection: jest.fn(async (..._args: unknown[]) => undefined),
    replaceCustomSections: jest.fn(async (..._args: unknown[]) => []),
    findVisibleCampaignId: jest.fn(async () => current?.globalId ?? null),
    listBeneficiaryBankAccounts: jest.fn(async () => []),
    addBeneficiaryBankAccount: jest.fn(async () => ({
      status: 'CREATED',
      account: {},
    })),
    closeBeneficiaryBankAccount: jest.fn(async () => true),
    verifyBeneficiaryBankAccount: jest.fn(async () => null),
    findOwnerFullName: jest.fn(async () => 'Nguyễn Văn Đức'),
  };
  const engagement = {
    ensureTasks: jest.fn(async (..._args: unknown[]) => undefined),
    taskScheduleInputs: jest.fn(async () => ({
      earliestIntakeDeadline: null,
      distributionStartsAt: null,
    })),
    listTasks: jest.fn(async () => [] as unknown[]),
    listChangedFields: jest.fn(async () => []),
    counters: jest.fn(async () => ({
      reactionCount: 0,
      commentCount: 0,
      followerCount: 0,
    })),
    isFollowing: jest.fn(async () => false),
  };
  const entitlements = {
    getCapability: jest.fn(async (_user: string, code: string) =>
      code === 'PUBLISH_CHARITY_WITHOUT_REVIEW'
        ? { allowed: options.capability?.publishNow ?? false }
        : { allowed: true },
    ),
  };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  const events = {
    ensureEventSteps: jest.fn(async (..._args: unknown[]) => undefined),
    listEventSteps: jest.fn(async () => []),
  };
  const summaries = {
    getSummary: jest.fn(async () => null),
    listFinancialReports: jest.fn(async () => []),
    publicSupporters: jest.fn(async () => ({
      supporterCount: 0,
      participantCount: 0,
      supporters: [],
      participants: [],
    })),
    intakeTotals: jest.fn(async () => ({
      material: { lines: [], confirmedValue: 0 },
      money: {
        confirmedAmount: 0,
        externalAmount: 0,
        totalAmount: 0,
        reportedIncome: 0,
      },
      service: { lines: [] },
    })),
  };
  return {
    campaigns,
    admin,
    projects,
    entitlements,
    access,
    engagement,
    events,
    summaries,
  };
}

describe('CharityProjectAccess', () => {
  it('người lạ → 404 (không lộ dự án nháp của người khác)', async () => {
    const deps = make();
    await expect(deps.access.resolve(CampaignId, Stranger)).rejects.toThrow(
      CharityCampaignNotFoundException,
    );
  });

  it('coordinator vận hành được nhưng KHÔNG sửa hồ sơ', async () => {
    const deps = make({ coordinator: true });
    await expect(
      deps.access.forOperate({ userId: Coordinator, campaignId: CampaignId }),
    ).resolves.toBeDefined();
    await expect(
      deps.access.forEdit({ userId: Coordinator, campaignId: CampaignId }),
    ).rejects.toThrow(CharityProjectForbiddenException);
  });

  it('dự án bị đình chỉ: chủ dự án không sửa được, Admin vẫn sửa được', async () => {
    const owner = make({ campaign: campaign({ isActive: false }) });
    await expect(
      owner.access.forEdit({ userId: Owner, campaignId: CampaignId }),
    ).rejects.toThrow(CharityProjectInactiveException);
    const admin = make({
      campaign: campaign({ isActive: false }),
      adminWrite: true,
    });
    await expect(
      admin.access.forEdit({ userId: Stranger, campaignId: CampaignId }),
    ).resolves.toBeDefined();
  });
});

describe('SubmitCharityProjectUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new SubmitCharityProjectUseCase(
      deps.access,
      deps.projects as never,
      deps.campaigns as never,
      deps.entitlements as never,
      deps.admin as never,
    );
  const draft = campaign({
    submittedAt: null,
    approvalStatus: 'PENDING_APPROVAL',
    approvedAt: null,
    operationStage: 'PLAN',
    storedOperationStage: 'PLAN',
  });

  it('thiếu tài khoản nhận MONEY → 409, không gửi nháp', async () => {
    const deps = make({ campaign: draft });
    deps.projects.intakeCounts.mockResolvedValue({
      openMaterialNeeds: 1,
      openFundingNeeds: 1,
      openSupportNeeds: 1,
      liveBankAccounts: 0,
    });
    await expect(
      build(deps).handle({ userId: Owner, campaignId: CampaignId }),
    ).rejects.toThrow(CharitySubmitRequirementsUnmetException);
    expect(deps.projects.submitDraft).not.toHaveBeenCalled();
  });

  it('đủ nhu cầu theo loại tiếp nhận thì gửi nháp', async () => {
    const deps = make({ campaign: draft });
    await build(deps).handle({ userId: Owner, campaignId: CampaignId });
    expect(deps.projects.intakeCounts).toHaveBeenCalledWith(CampaignId);
    expect(deps.projects.submitDraft).toHaveBeenCalled();
  });

  it('nhu cầu tình nguyện không tính là SERVICE', async () => {
    const deps = make({
      campaign: campaign({
        ...draft,
        acceptedContributionTypes: ['SERVICE'],
      }),
    });
    deps.projects.intakeCounts.mockResolvedValue({
      openMaterialNeeds: 0,
      openFundingNeeds: 0,
      openSupportNeeds: 0,
      liveBankAccounts: 0,
    });
    await expect(
      build(deps).handle({ userId: Owner, campaignId: CampaignId }),
    ).rejects.toThrow(CharitySubmitRequirementsUnmetException);
  });

  it('có capability public ngay → gửi với APPROVED', async () => {
    const deps = make({ campaign: draft, capability: { publishNow: true } });
    await build(deps).handle({ userId: Owner, campaignId: CampaignId });
    expect(deps.projects.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'APPROVED' }),
    );
  });

  it('không có capability → PENDING_APPROVAL', async () => {
    const deps = make({ campaign: draft });
    await build(deps).handle({ userId: Owner, campaignId: CampaignId });
    expect(deps.projects.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'PENDING_APPROVAL' }),
    );
  });

  it('kêu gọi cho người khác chưa đồng ý → PENDING kể cả có capability', async () => {
    const deps = make({
      campaign: {
        ...draft,
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'OTHER',
      },
      capability: { publishNow: true },
    });
    await build(deps).handle({ userId: Owner, campaignId: CampaignId });
    expect(deps.projects.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'PENDING_APPROVAL' }),
    );
  });

  it('không còn là nháp → 409; Admin không gửi thay chủ dự án', async () => {
    await expect(
      build(make()).handle({ userId: Owner, campaignId: CampaignId }),
    ).rejects.toThrow(CharityProjectNotDraftException);
    await expect(
      build(make({ campaign: draft, adminWrite: true })).handle({
        userId: Stranger,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(CharityProjectForbiddenException);
  });
});

describe('Tổng duyệt và cổng chuyển giai đoạn', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new MoveCharityStageUseCase(
      deps.access,
      deps.projects as never,
      deps.campaigns as never,
    );
  const move = (to: 'EVENT' | 'SUMMARY') => ({
    userId: Owner,
    campaignId: CampaignId,
    to,
    reason: 'Chuyển tay',
  });
  const atEvent = () =>
    make({
      campaign: campaign({
        operationStage: 'EVENT',
        storedOperationStage: 'EVENT',
      }),
    });

  it('chuyển tay EXECUTION→EVENT khi tổng duyệt NOT_READY → 409 0x13_5f, moveStage không gọi', async () => {
    const deps = make();
    deps.projects.getRehearsal.mockResolvedValue({
      campaignId: CampaignId,
      checklist: [],
      outcome: 'NOT_READY',
      reason: 'Chưa có xe',
      note: null,
      decidedBy: Owner,
      decidedAt: new Date(),
      phase: null,
    });
    await expect(build(deps).handle(move('EVENT'))).rejects.toBeInstanceOf(
      CharityRehearsalNotReadyException,
    );
    expect(deps.projects.moveStage).not.toHaveBeenCalled();
  });

  it('chưa có dòng tổng duyệt → 409 0x13_5f', async () => {
    const deps = make();
    deps.projects.getRehearsal.mockResolvedValue(null);
    await expect(build(deps).handle(move('EVENT'))).rejects.toBeInstanceOf(
      CharityRehearsalNotReadyException,
    );
  });

  it('READY → chuyển được', async () => {
    const deps = make();
    await build(deps).handle(move('EVENT'));
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'EVENT' }),
    );
  });

  it("EVENT→SUMMARY thiếu bằng chứng SHIPPING → 409 0x13_59 'trackingCode'", async () => {
    const deps = atEvent();
    deps.projects.distributionSettlement.mockResolvedValue({
      method: 'SHIPPING',
      evidenceUrls: ['https://cdn.test/a.jpg'],
      trackingCode: null,
      beneficiaryAccount: null,
    });
    const failure = build(deps).handle(move('SUMMARY'));
    await expect(failure).rejects.toBeInstanceOf(
      CharityRoundEvidenceRequiredException,
    );
    await expect(failure).rejects.toThrow(/trackingCode/);
    expect(deps.projects.moveStage).not.toHaveBeenCalled();
  });

  it('BANK_TRANSFER tài khoản chưa xác thực → 409 0x13_5b', async () => {
    const deps = atEvent();
    deps.projects.distributionSettlement.mockResolvedValue({
      method: 'BANK_TRANSFER',
      evidenceUrls: ['https://cdn.test/a.jpg'],
      trackingCode: null,
      beneficiaryAccount: { verified: false, live: true, sameCampaign: true },
    });
    await expect(build(deps).handle(move('SUMMARY'))).rejects.toBeInstanceOf(
      CharityBeneficiaryAccountNotVerifiedException,
    );
  });

  it('method null → SUMMARY được', async () => {
    const deps = atEvent();
    await build(deps).handle(move('SUMMARY'));
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'SUMMARY' }),
    );
  });

  it('PUT rehearsal NOT_READY không lý do → 400', async () => {
    const deps = make();
    await expect(
      new SaveCharityRehearsalUseCase(
        deps.access,
        deps.projects as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        rehearsal: {
          checklist: [],
          outcome: 'NOT_READY',
          reason: '  ',
          note: null,
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.projects.saveRehearsal).not.toHaveBeenCalled();
  });

  it('checklist 3 mục → lưu đủ 7', async () => {
    const deps = make();
    await new SaveCharityRehearsalUseCase(
      deps.access,
      deps.projects as never,
    ).handle({
      userId: Owner,
      campaignId: CampaignId,
      rehearsal: {
        checklist: [
          { key: 'RECIPIENTS', status: 'DONE', note: null },
          { key: 'TRANSPORT', status: 'DONE', note: 'Xe 16 chỗ' },
          { key: 'STAFF', status: 'NOT_DONE', note: null },
        ],
        outcome: 'READY',
        reason: null,
        note: null,
      },
    });
    const saved = deps.projects.saveRehearsal.mock.calls[0][0] as {
      checklist: unknown[];
      outcome: string;
    };
    expect(saved.checklist).toHaveLength(7);
    expect(saved.outcome).toBe('READY');
  });
});

describe('MoveCharityStageUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new MoveCharityStageUseCase(
      deps.access,
      deps.projects as never,
      deps.campaigns as never,
    );
  const cmd = (
    to: 'EXECUTION' | 'EVENT' | 'SUMMARY',
    reason: string | null = 'Đủ đồ, chuyển sớm',
  ) => ({
    userId: Owner,
    campaignId: CampaignId,
    to,
    reason,
  });

  it('tiến một bước: ghi từ giai đoạn đang lưu', async () => {
    const deps = make();
    await build(deps).handle(cmd('EVENT'));
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'EXECUTION',
        to: 'EVENT',
        actorId: Owner,
      }),
    );
  });

  it('nhảy hai bước, về PLAN, chưa duyệt → không hợp lệ', async () => {
    await expect(build(make()).handle(cmd('SUMMARY'))).rejects.toThrow(
      CharityStageTransitionInvalidException,
    );
    await expect(
      build(make()).handle({ ...cmd('EVENT'), to: 'PLAN' as never }),
    ).rejects.toThrow(CharityStageTransitionInvalidException);
    await expect(
      build(
        make({
          campaign: campaign({
            approvalStatus: 'PENDING_APPROVAL',
            operationStage: 'PLAN',
          }),
        }),
      ).handle(cmd('EXECUTION')),
    ).rejects.toThrow(CharityStageTransitionInvalidException);
  });

  it('chuyển tay (lùi hay tiến) phải có lý do — chốt 05/11', async () => {
    const deps = make({
      campaign: campaign({
        operationStage: 'EVENT',
        storedOperationStage: 'EVENT',
      }),
    });
    await expect(build(deps).handle(cmd('EXECUTION', null))).rejects.toThrow(
      CharityStageTransitionInvalidException,
    );
    await expect(build(make()).handle(cmd('EVENT', '  '))).rejects.toThrow(
      CharityStageTransitionInvalidException,
    );
  });

  it('lùi mà lịch sẽ đẩy tới lại ngay → CHARITY_STAGE_SCHEDULE_CONFLICT', async () => {
    const deps = make({
      campaign: campaign({
        operationStage: 'EVENT',
        storedOperationStage: 'EVENT',
        distribution: {
          startsAt: new Date(Date.now() - Hour),
          endsAt: new Date(Date.now() + Hour),
        },
      }),
    });
    await expect(
      build(deps).handle(cmd('EXECUTION', 'Hoãn trao')),
    ).rejects.toThrow(CharityStageScheduleConflictException);
  });

  it('cột lưu trễ so với mốc: ghi bước bắt kịp (hệ thống) trước', async () => {
    const deps = make({
      campaign: campaign({
        operationStage: 'EVENT',
        storedOperationStage: 'EXECUTION',
      }),
    });
    await build(deps).handle(cmd('SUMMARY'));
    expect(deps.projects.moveStage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        from: 'EXECUTION',
        to: 'EVENT',
        actorId: null,
      }),
    );
    expect(deps.projects.moveStage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ from: 'EVENT', to: 'SUMMARY', actorId: Owner }),
    );
  });

  it('người khác vừa chuyển (STALE) → báo lỗi, không im lặng', async () => {
    const deps = make();
    deps.projects.moveStage.mockResolvedValueOnce('STALE');
    await expect(build(deps).handle(cmd('EVENT'))).rejects.toThrow(
      CharityStageTransitionInvalidException,
    );
  });
});

describe('AdvanceCharityStagesUseCase · cổng và nhắc ban tổ chức', () => {
  const dispatcher = () => ({
    handle: jest.fn(async () => ({ created: true, pushedDevices: 0 })),
  });

  it('job: ứng viên chưa READY không chuyển, gửi nhắc REHEARSAL_NOT_READY một lần/ngày', async () => {
    const deps = make();
    deps.projects.listStageCandidates.mockResolvedValue([]);
    deps.projects.listBlockedStageCampaigns.mockResolvedValue([
      { campaignId: 'blocked', ownerId: Owner, reason: 'REHEARSAL_NOT_READY' },
    ]);
    const sender = dispatcher();
    const result = await new AdvanceCharityStagesUseCase(
      deps.projects as never,
      sender as never,
    ).handle({ limit: 10, dryRun: false });
    expect(result).toEqual({ advanced: 0, checked: 0, reminded: 1 });
    expect(deps.projects.moveStage).not.toHaveBeenCalled();
    expect(sender.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: Owner,
        type: NotificationTypes.CHARITY_ORGANIZER_REMINDER,
        idempotencyKey: expect.stringMatching(
          /^CHARITY_ORGANIZER_REMINDER:blocked:REHEARSAL_NOT_READY:/,
        ),
      }),
    );
  });

  it('job nhắc SUMMARY_OVERDUE cho chiến dịch quá endTime chưa công khai tổng kết', async () => {
    const deps = make();
    deps.projects.listOverdueSummaries.mockResolvedValue([
      { campaignId: 'overdue', ownerId: Owner },
    ]);
    const sender = dispatcher();
    const result = await new AdvanceCharityStagesUseCase(
      deps.projects as never,
      sender as never,
    ).handle({ limit: 10, dryRun: false });
    expect(result.reminded).toBe(1);
    expect(sender.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: Owner,
        type: NotificationTypes.CHARITY_ORGANIZER_REMINDER,
        idempotencyKey: expect.stringMatching(
          /^CHARITY_ORGANIZER_REMINDER:overdue:SUMMARY_OVERDUE:/,
        ),
      }),
    );
  });

  it('job không bao giờ EXECUTION→SUMMARY', async () => {
    const deps = make();
    deps.projects.listStageCandidates.mockResolvedValue([
      {
        campaignId: 'late',
        stored: 'EXECUTION',
        endTime: new Date(Date.now() - 48 * Hour),
        distribution: {
          startsAt: new Date(Date.now() - 72 * Hour),
          endsAt: new Date(Date.now() - 60 * Hour),
        },
        rehearsalReady: true,
        distributionSettled: true,
      },
    ]);
    await new AdvanceCharityStagesUseCase(
      deps.projects as never,
      dispatcher() as never,
    ).handle({ limit: 10, dryRun: false });
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'EXECUTION', to: 'EVENT' }),
    );
    expect(deps.projects.moveStage).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'SUMMARY' }),
    );
  });
});

describe('AdvanceCharityStagesUseCase', () => {
  it('chỉ chuyển dự án đã tới mốc; chạy khô không ghi', async () => {
    const deps = make();
    deps.projects.listStageCandidates.mockResolvedValue([
      {
        // EXECUTION không bao giờ nhảy thẳng SUMMARY (CR 22/11/2026): dự án đã ở EVENT.
        campaignId: 'a',
        stored: 'EVENT',
        endTime: new Date(Date.now() - Hour),
        distribution: null,
        rehearsalReady: true,
        distributionSettled: true,
      },
      {
        campaignId: 'b',
        stored: 'EXECUTION',
        endTime: new Date(Date.now() + Hour),
        distribution: null,
        rehearsalReady: true,
        distributionSettled: true,
      },
    ]);
    const useCase = new AdvanceCharityStagesUseCase(
      deps.projects as never,
      { handle: jest.fn() } as never,
    );
    await expect(useCase.handle({ limit: 10, dryRun: true })).resolves.toEqual({
      advanced: 1,
      checked: 2,
      reminded: 0,
    });
    expect(deps.projects.moveStage).not.toHaveBeenCalled();
    await expect(useCase.handle({ limit: 10, dryRun: false })).resolves.toEqual(
      { advanced: 1, checked: 2, reminded: 0 },
    );
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'a',
        from: 'EVENT',
        to: 'SUMMARY',
        actorId: null,
      }),
    );
  });
});

describe('UpdateCharityProfileUseCase · loại tiếp nhận', () => {
  it('acceptedContributionTypes undefined giữ nguyên, mảng thì thay chuẩn hoá', async () => {
    const deps = make();
    deps.projects.getProfile.mockResolvedValue({
      appealPurpose: null,
      appealAudience: null,
      appealCircumstance: null,
      callToActions: [],
      acceptedContributionTypes: ['MONEY'] as never,
      maxBankAccounts: null,
    });
    const useCase = new UpdateCharityProfileUseCase(
      deps.access,
      deps.projects as never,
    );
    await useCase.handle({
      userId: Owner,
      campaignId: CampaignId,
      profile: {},
    });
    expect(deps.projects.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          acceptedContributionTypes: ['MONEY'] as never,
        }),
      }),
    );
    await useCase.handle({
      userId: Owner,
      campaignId: CampaignId,
      profile: {
        acceptedContributionTypes: ['SERVICE', 'MATERIAL', 'SERVICE'],
      },
    });
    expect(deps.projects.updateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          acceptedContributionTypes: ['MATERIAL', 'SERVICE'],
        }),
      }),
    );
  });
});

describe('Hồ sơ tab A', () => {
  it('parties: BENEFICIARY phải có beneficiaryKind, vai khác không được có', async () => {
    const deps = make();
    const useCase = new ReplaceCharityPartiesUseCase(
      deps.access,
      deps.projects as never,
    );
    const party = {
      role: 'ORGANIZER' as const,
      name: 'CLB',
      address: null,
      phone: null,
      email: null,
      hotline: null,
      picName: null,
      picPhone: null,
      picUserId: null,
      evidenceUrls: [],
    };
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        parties: [{ ...party, beneficiaryKind: 'GROUP' }],
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        parties: [{ ...party, role: 'BENEFICIARY', beneficiaryKind: null }],
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  const beneficiaryAccount = (overrides: Record<string, unknown> = {}) => ({
    accountId: 'acc-1',
    holderType: 'OWNER',
    partyId: null,
    bankName: 'VCB',
    accountNo: '0123456789',
    accountName: 'NGUYEN VAN DUC',
    validFrom: new Date('2026-11-01T00:00:00Z'),
    validTo: null,
    closeReason: null,
    verifiedAt: null,
    verifiedBy: null,
    ...overrides,
  });
  const addBeneficiary = (
    account: Record<string, unknown>,
    replacesAccountId: string | null = null,
  ) => ({
    userId: Owner,
    campaignId: CampaignId,
    account: {
      holderType: 'OWNER' as const,
      partyId: null,
      bankName: ' VCB ',
      accountNo: ' 0123456789 ',
      accountName: ' NGUYEN VAN DUC ',
      ...account,
    },
    replacesAccountId,
    replaceReason: null,
  });

  it("OWNER 'NGUYEN VAN DUC' với full_name 'Nguyễn Văn Đức' → tạo", async () => {
    const deps = make();
    deps.projects.addBeneficiaryBankAccount.mockResolvedValueOnce({
      status: 'CREATED',
      account: beneficiaryAccount(),
    } as never);
    const created = await new AddCharityBeneficiaryBankAccountUseCase(
      deps.access,
      deps.projects as never,
    ).handle(addBeneficiary({ partyId: 'p1' }));
    expect(created).toMatchObject({ accountId: 'acc-1' });
    expect(deps.projects.findOwnerFullName).toHaveBeenCalledWith(CampaignId);
    expect(deps.projects.addBeneficiaryBankAccount).toHaveBeenCalledWith({
      campaignId: CampaignId,
      actorId: Owner,
      account: {
        holderType: 'OWNER',
        partyId: null,
        bankName: 'VCB',
        accountNo: '0123456789',
        accountName: 'NGUYEN VAN DUC',
      },
      replacesAccountId: null,
      replaceReason: null,
    });
  });

  it('OWNER tên lệch hoặc chủ dự án chưa có full_name → 400 0x13_5a', async () => {
    const deps = make();
    const useCase = new AddCharityBeneficiaryBankAccountUseCase(
      deps.access,
      deps.projects as never,
    );
    for (const ownerName of ['Nguyễn Văn Nam', null]) {
      deps.projects.findOwnerFullName.mockResolvedValueOnce(ownerName as never);
      const failure = useCase
        .handle(addBeneficiary({}))
        .catch((error: unknown) => error);
      await expect(failure).resolves.toBeInstanceOf(
        CharityBeneficiaryAccountNameMismatchException,
      );
      await expect(failure).resolves.toMatchObject({ code: 0x13_5a });
    }
    expect(deps.projects.addBeneficiaryBankAccount).not.toHaveBeenCalled();
  });

  it('BENEFICIARY partyId không phải BENEFICIARY của dự án → 400; đúng bên thì so tên với bên đó', async () => {
    const deps = make();
    const useCase = new AddCharityBeneficiaryBankAccountUseCase(
      deps.access,
      deps.projects as never,
    );
    for (const partyId of ['p2', 'p-khac', null])
      await expect(
        useCase.handle(
          addBeneficiary({
            holderType: 'BENEFICIARY',
            partyId,
            accountName: 'CLB B',
          }),
        ),
      ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle(
        addBeneficiary({ holderType: 'BENEFICIARY', partyId: 'p1' }),
      ),
    ).rejects.toThrow(CharityBeneficiaryAccountNameMismatchException);
    expect(deps.projects.addBeneficiaryBankAccount).not.toHaveBeenCalled();
    deps.projects.addBeneficiaryBankAccount.mockResolvedValueOnce({
      status: 'CREATED',
      account: beneficiaryAccount({ holderType: 'BENEFICIARY', partyId: 'p1' }),
    } as never);
    await useCase.handle(
      addBeneficiary({
        holderType: 'BENEFICIARY',
        partyId: 'p1',
        accountName: 'BA A',
      }),
    );
    expect(deps.projects.findOwnerFullName).not.toHaveBeenCalled();
    expect(deps.projects.addBeneficiaryBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          holderType: 'BENEFICIARY',
          partyId: 'p1',
        }),
      }),
    );
  });

  it('tài khoản thụ hưởng: tắt MONEY → 409; thay tài khoản không có → 404', async () => {
    const off = make({ campaign: campaign({ acceptedContributionTypes: [] }) });
    await expect(
      new AddCharityBeneficiaryBankAccountUseCase(
        off.access,
        off.projects as never,
      ).handle(addBeneficiary({})),
    ).rejects.toThrow(CharityContributionTypeDisabledException);
    expect(off.projects.findOwnerFullName).not.toHaveBeenCalled();
    const deps = make();
    deps.projects.addBeneficiaryBankAccount.mockResolvedValueOnce({
      status: 'REPLACED_NOT_FOUND',
    } as never);
    await expect(
      new AddCharityBeneficiaryBankAccountUseCase(
        deps.access,
        deps.projects as never,
      ).handle(addBeneficiary({}, 'acc-cu')),
    ).rejects.toThrow(CharityBankAccountNotFoundException);
  });

  it('đóng tài khoản thụ hưởng không còn hiệu lực → 404', async () => {
    const deps = make();
    deps.projects.closeBeneficiaryBankAccount.mockResolvedValueOnce(false);
    const useCase = new CloseCharityBeneficiaryBankAccountUseCase(
      deps.access,
      deps.projects as never,
    );
    const command = {
      userId: Owner,
      campaignId: CampaignId,
      accountId: 'acc-1',
      reason: ' Sai số ',
    };
    await expect(useCase.handle(command)).rejects.toThrow(
      CharityBankAccountNotFoundException,
    );
    await expect(useCase.handle(command)).resolves.toEqual({ closed: true });
    expect(deps.projects.closeBeneficiaryBankAccount).toHaveBeenLastCalledWith({
      campaignId: CampaignId,
      accountId: 'acc-1',
      actorId: Owner,
      reason: 'Sai số',
    });
  });

  it('Admin xác thực: thiếu quyền → 403; không có / đã đóng → 404; có thì trả dòng', async () => {
    const command = {
      userId: Owner,
      campaignId: CampaignId,
      accountId: 'acc-1',
    };
    const denied = make();
    await expect(
      new VerifyCharityBeneficiaryBankAccountUseCase(
        denied.admin as never,
        denied.projects as never,
      ).handle(command),
    ).rejects.toThrow(CharityProjectForbiddenException);
    expect(denied.projects.verifyBeneficiaryBankAccount).not.toHaveBeenCalled();
    const deps = make({ adminWrite: true });
    const useCase = new VerifyCharityBeneficiaryBankAccountUseCase(
      deps.admin as never,
      deps.projects as never,
    );
    await expect(useCase.handle(command)).rejects.toThrow(
      CharityBankAccountNotFoundException,
    );
    const verified = beneficiaryAccount({
      verifiedAt: new Date(),
      verifiedBy: Owner,
    });
    deps.projects.verifyBeneficiaryBankAccount.mockResolvedValueOnce(
      verified as never,
    );
    await expect(useCase.handle(command)).resolves.toBe(verified);
    expect(deps.projects.verifyBeneficiaryBankAccount).toHaveBeenCalledWith({
      campaignId: CampaignId,
      accountId: 'acc-1',
      actorId: Owner,
    });
  });

  it('workspace có beneficiaryBankAccounts; public project không có key này', async () => {
    const deps = make();
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      beneficiaryAccount({ accountNo: '9988776655' }),
    ] as never);
    const workspace = await new GetCharityWorkspaceUseCase(
      deps.access,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
    ).handle({ userId: Owner, campaignId: CampaignId });
    expect(workspace.beneficiaryBankAccounts).toEqual([
      beneficiaryAccount({ accountNo: '9988776655' }),
    ]);
    deps.projects.listBeneficiaryBankAccounts.mockClear();
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
    ).handle({ idOrSlug: 'mua-dong-am', userId: null });
    expect(view).not.toHaveProperty('beneficiaryBankAccounts');
    expect(JSON.stringify(view)).not.toContain('9988776655');
    expect(deps.projects.listBeneficiaryBankAccounts).not.toHaveBeenCalled();
  });

  it('public: hình thức trao đúng 5 khoá công khai, không có privateDetails', async () => {
    const deps = make();
    const operations = {
      getDistribution: jest.fn(async () => ({
        campaignId: CampaignId,
        distributionMethod: 'SHIPPING',
        contributionTypes: ['MATERIAL'],
        serviceType: null,
        serviceChannel: null,
        evidenceUrls: ['https://cdn.test/e.jpg'],
        privateDetails: {
          recipientPhone: '0912345678',
          recipientAddress: 'Số 9 ngõ kín',
          trackingCode: 'VN999',
        },
        updatedAt: new Date(),
      })),
    };
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
      operations as never,
    ).handle({ idOrSlug: 'mua-dong-am', userId: null });
    expect(Object.keys(view.distribution ?? {}).sort()).toEqual([
      'contributionTypes',
      'evidenceUrls',
      'method',
      'serviceChannel',
      'serviceType',
    ]);
    expect(view.distribution?.method).toBe('SHIPPING');
    const json = JSON.stringify(view);
    expect(json).not.toContain('0912345678');
    expect(json).not.toContain('Số 9 ngõ kín');
    expect(json).not.toContain('VN999');
  });

  it('PUT parties bỏ bên thụ hưởng thường còn tài khoản → 400; dòng kêu gọi cá nhân bỏ qua; giữ + đổi tên thì được', async () => {
    const deps = make();
    const groupParty = {
      partyId: 'p3',
      role: 'BENEFICIARY',
      isAppealSubject: false,
      name: 'Nhóm C',
      address: null,
      phone: null,
      email: null,
      hotline: null,
      beneficiaryKind: 'GROUP',
    };
    deps.projects.listParties.mockResolvedValue([
      ...(await deps.projects.listParties()),
      groupParty,
    ] as never);
    // p1 là người thụ hưởng kêu gọi cá nhân (replaceParties không bao giờ chạm dòng này).
    deps.projects.listBeneficiaryBankAccounts.mockResolvedValue([
      beneficiaryAccount({ holderType: 'BENEFICIARY', partyId: 'p1' }),
      beneficiaryAccount({
        accountId: 'acc-3',
        holderType: 'BENEFICIARY',
        partyId: 'p3',
      }),
    ] as never);
    const useCase = new ReplaceCharityPartiesUseCase(
      deps.access,
      deps.projects as never,
    );
    const failure = useCase
      .handle({ userId: Owner, campaignId: CampaignId, parties: [] })
      .catch((error: unknown) => error);
    await expect(failure).resolves.toBeInstanceOf(ValidationFailedException);
    await expect(failure).resolves.toMatchObject({
      message:
        'parties: bên thụ hưởng "Nhóm C" còn tài khoản thụ hưởng đang hiệu lực — đóng tài khoản trước',
      explains: [],
    });
    expect(deps.projects.replaceParties).not.toHaveBeenCalled();
    await useCase.handle({
      userId: Owner,
      campaignId: CampaignId,
      parties: [
        {
          ...groupParty,
          name: 'Nhóm C (đổi tên)',
          evidenceUrls: [],
        } as never,
      ],
    });
    expect(deps.projects.replaceParties).toHaveBeenCalled();
    expect(deps.projects.closeBeneficiaryBankAccount).not.toHaveBeenCalled();
  });

  it('workspace: coordinator không thấy tài khoản của người thụ hưởng kêu gọi cá nhân; chủ dự án thấy', async () => {
    const accounts = [
      beneficiaryAccount(),
      beneficiaryAccount({
        accountId: 'acc-appeal',
        holderType: 'BENEFICIARY',
        partyId: 'p1',
      }),
    ];
    const run = async (
      deps: ReturnType<typeof make>,
      userId: string,
    ): Promise<string[]> => {
      deps.projects.listBeneficiaryBankAccounts.mockResolvedValue(
        accounts as never,
      );
      const view = await new GetCharityWorkspaceUseCase(
        deps.access,
        deps.projects as never,
        deps.engagement as never,
        deps.events as never,
      ).handle({ userId, campaignId: CampaignId });
      return view.beneficiaryBankAccounts.map((a) => a.accountId);
    };
    await expect(
      run(make({ coordinator: true }), Coordinator),
    ).resolves.toEqual(['acc-1']);
    await expect(run(make(), Owner)).resolves.toEqual(['acc-1', 'acc-appeal']);
  });

  it('bank account: tắt MONEY → 409', async () => {
    const deps = make({
      campaign: campaign({ acceptedContributionTypes: [] }),
    });
    await expect(
      new AddCharityBankAccountUseCase(
        deps.access,
        deps.projects as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        account: {
          label: null,
          bankName: 'VCB',
          accountNo: '0123',
          accountName: 'CLB',
        },
        replacesAccountId: null,
        replaceReason: null,
      }),
    ).rejects.toThrow(CharityContributionTypeDisabledException);
    expect(deps.projects.addBankAccount).not.toHaveBeenCalled();
  });

  it('bank account: hết suất → 409 kèm giới hạn; giới hạn lấy từ cấu hình khi không ghi đè', async () => {
    const deps = make();
    const useCase = new AddCharityBankAccountUseCase(
      deps.access,
      deps.projects as never,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        account: {
          label: null,
          bankName: 'VCB',
          accountNo: '0123',
          accountName: 'CLB',
        },
        replacesAccountId: null,
        replaceReason: null,
      }),
    ).rejects.toThrow(CharityBankAccountLimitException);
    expect(deps.projects.addBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 }),
    );
  });

  it('funding need: tắt MONEY → 409', async () => {
    const deps = make({
      campaign: campaign({ acceptedContributionTypes: [] }),
    });
    const useCase = new SaveCharityFundingNeedUseCase(
      deps.access,
      deps.projects as never,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        fundingNeedId: null,
        need: {
          title: 'Viện phí',
          description: null,
          beneficiaryPartyId: null,
          receivingUnit: null,
          bankAccountId: null,
          targetAmount: 100_000,
          deadline: null,
          sortOrder: 0,
        },
      }),
    ).rejects.toThrow(CharityContributionTypeDisabledException);
    expect(deps.projects.createFundingNeed).not.toHaveBeenCalled();
  });

  describe('funding need khi MONEY đã tắt (F5)', () => {
    const storedNeed = {
      fundingNeedId: 'f1',
      title: 'Viện phí',
      description: null,
      beneficiaryPartyId: null,
      receivingUnit: null,
      bankAccountId: 'acc-closed',
      targetAmount: 100_000,
      deadline: new Date('2026-12-31T00:00:00Z'),
      sortOrder: 0,
      confirmedAmount: 10_000,
      externalAmount: 0,
      remainingAmount: 90_000,
      status: 'OPEN',
    };
    const needInput = {
      title: 'Viện phí',
      description: null,
      beneficiaryPartyId: null,
      receivingUnit: null,
      bankAccountId: 'acc-closed',
      targetAmount: 100_000,
      deadline: new Date('2026-12-31T00:00:00Z'),
      sortOrder: 0,
    };
    const setup = (stored: Record<string, unknown> = storedNeed) => {
      const deps = make({
        campaign: campaign({ acceptedContributionTypes: ['MATERIAL'] }),
      });
      deps.projects.listFundingNeeds.mockResolvedValue([stored] as never);
      const useCase = new SaveCharityFundingNeedUseCase(
        deps.access,
        deps.projects as never,
      );
      const save = (extra: Record<string, unknown>) =>
        useCase.handle({
          userId: Owner,
          campaignId: CampaignId,
          fundingNeedId: 'f1',
          need: needInput,
          ...extra,
        } as never);
      return { deps, save };
    };

    it('đóng nhu cầu + ghi số tiền đã nhận, không đổi gì khác → được', async () => {
      const { deps, save } = setup();
      await save({
        status: 'CLOSED',
        confirmedAmount: 80_000,
        externalAmount: 5_000,
      });
      expect(deps.projects.updateFundingNeed).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CLOSED',
          confirmedAmount: 80_000,
          externalAmount: 5_000,
        }),
      );
    });

    it('chỉ ghi số tiền đã nhận (giữ trạng thái) → được', async () => {
      const { deps, save } = setup();
      await save({ confirmedAmount: 50_000 });
      expect(deps.projects.updateFundingNeed).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'OPEN', confirmedAmount: 50_000 }),
      );
    });

    it.each([
      ['đổi tiêu đề', { need: { ...needInput, title: 'Tiền xe' } }],
      ['đổi số mục tiêu', { need: { ...needInput, targetAmount: 200_000 } }],
      [
        'đổi hạn',
        { need: { ...needInput, deadline: new Date('2027-01-31T00:00:00Z') } },
      ],
      ['đổi tài khoản nhận', { need: { ...needInput, bankAccountId: null } }],
    ])('%s → 409', async (_label, extra) => {
      const { deps, save } = setup();
      await expect(save({ status: 'CLOSED', ...extra })).rejects.toThrow(
        CharityContributionTypeDisabledException,
      );
      expect(deps.projects.updateFundingNeed).not.toHaveBeenCalled();
    });

    it('mở lại nhu cầu đã đóng → 409', async () => {
      const { deps, save } = setup({ ...storedNeed, status: 'CLOSED' });
      await expect(save({ status: 'OPEN' })).rejects.toThrow(
        CharityContributionTypeDisabledException,
      );
      expect(deps.projects.updateFundingNeed).not.toHaveBeenCalled();
    });
  });

  it('phases: chồng thời gian hoặc deliveryMethod sai bước → lỗi', async () => {
    const deps = make();
    const useCase = new ReplaceCharityPhasesUseCase(
      deps.access,
      deps.projects as never,
    );
    const at = (h: number) => new Date(Date.now() + h * Hour);
    const base = {
      picName: null,
      picUserId: null,
      hotline: null,
      reportMode: null,
    };
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        phases: [
          {
            ...base,
            phase: 'PLANNING',
            startsAt: at(0),
            endsAt: at(10),
            deliveryMethod: null,
          },
          {
            ...base,
            phase: 'PREPARATION',
            startsAt: at(5),
            endsAt: at(20),
            deliveryMethod: null,
          },
        ],
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        phases: [
          {
            ...base,
            phase: 'PLANNING',
            startsAt: at(0),
            endsAt: at(1),
            deliveryMethod: 'SHIP',
          },
        ],
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('form mở: giá trị phải hợp kiểu; SELECT cần lựa chọn', async () => {
    const deps = make();
    const useCase = new ReplaceCharityCustomSectionsUseCase(
      deps.access,
      deps.projects as never,
    );
    const field = (
      fieldType: string,
      value: unknown,
      options: string[] = [],
    ) => ({
      label: 'x',
      fieldType: fieldType as never,
      visibility: 'PUBLIC' as const,
      required: false,
      options,
      value,
    });
    for (const bad of [
      field('NUMBER', 'mười'),
      field('URL', 'không-phải-url'),
      field('SELECT', 'C', ['A', 'B']),
      field('SELECT', null),
      field('CHECKBOX', 'true'),
    ])
      await expect(
        useCase.handle({
          userId: Owner,
          campaignId: CampaignId,
          sections: [
            {
              parentSection: 'PLAN',
              title: 'Thêm',
              visibility: 'PUBLIC',
              fields: [bad],
            },
          ],
        }),
      ).rejects.toThrow(ValidationFailedException);
  });
});

describe('Đăng ký tham gia', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new RegisterCharityVolunteerUseCase(
      deps.campaigns as never,
      deps.projects as never,
    );
  const cmd = {
    userId: Stranger,
    campaignId: CampaignId,
    volunteerNeedId: 'v1',
  };

  it('đăng ký tình nguyện viên không bị chặn khi accepted = []', async () => {
    const deps = make({
      campaign: campaign({ acceptedContributionTypes: [] }),
    });
    await expect(build(deps).handle(cmd)).resolves.toEqual({
      registered: true,
    });
  });

  it('bước trao đã bắt đầu → không nhận đăng ký mới', async () => {
    await expect(
      build(make({ campaign: campaign({ operationStage: 'EVENT' }) })).handle(
        cmd,
      ),
    ).rejects.toThrow(CharityVolunteerClosedException);
  });

  it.each([
    ['FULL', CharityVolunteerClosedException],
    ['CLOSED', CharityVolunteerClosedException],
  ])('%s → lỗi tương ứng', async (outcome, error) => {
    const deps = make();
    deps.projects.registerVolunteer.mockResolvedValueOnce(outcome);
    await expect(build(deps).handle(cmd)).rejects.toThrow(error);
  });

  it('dự án chưa duyệt hoặc đình chỉ → 404', async () => {
    await expect(
      build(make({ campaign: campaign({ isActive: false }) })).handle(cmd),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('Workspace và bản công khai', () => {
  it('coordinator KHÔNG thấy người thụ hưởng của kêu gọi cá nhân; chủ dự án thấy', async () => {
    const coordinator = make({ coordinator: true });
    const view = await new GetCharityWorkspaceUseCase(
      coordinator.access,
      coordinator.projects as never,
      coordinator.engagement as never,
      coordinator.events as never,
    ).handle({
      userId: Coordinator,
      campaignId: CampaignId,
    });
    expect(view.parties.map((p) => p.partyId)).toEqual(['p2']);
    expect(view.capabilities.canEdit).toBe(false);
    expect(view.capabilities.canAdvanceStage).toBe(true);

    const owner = make();
    const mine = await new GetCharityWorkspaceUseCase(
      owner.access,
      owner.projects as never,
      owner.engagement as never,
      owner.events as never,
    ).handle({
      userId: Owner,
      campaignId: CampaignId,
    });
    expect(mine.parties).toHaveLength(2);
  });

  it('bản công khai: chưa công khai tổng kết → totals null', async () => {
    const deps = make();
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
    ).handle({ idOrSlug: 'mua-dong-am', userId: null });
    expect(view.totals).toBeNull();
  });

  it('bản công khai: tắt MONEY → totals.money null', async () => {
    const deps = make({
      campaign: campaign({ acceptedContributionTypes: [] }),
    });
    deps.summaries.getSummary.mockResolvedValue({
      publishedAt: new Date(),
    } as never);
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
    ).handle({ idOrSlug: 'mua-dong-am', userId: null });
    expect(view.totals?.money).toBeNull();
  });

  it('bản công khai: tắt MONEY ẩn bankAccounts và fundingNeeds', async () => {
    const deps = make({
      campaign: campaign({ acceptedContributionTypes: [] }),
    });
    deps.projects.listFundingNeeds.mockResolvedValue([
      { fundingNeedId: 'f1' } as never,
    ]);
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
    ).handle({ idOrSlug: 'mua-dong-am', userId: null });
    expect(view.bankAccounts).toEqual([]);
    expect(view.fundingNeeds).toEqual([]);
  });

  it('bản công khai: chỉ tài khoản đang hiệu lực, không có SĐT người nhận hàng, mục chưa công khai không lộ nội dung', async () => {
    const deps = make();
    deps.projects.listSectionStates.mockResolvedValue([
      {
        sectionKey: 'PLAN',
        savedAt: new Date(),
        publishedAt: new Date(),
        publishedSnapshot: { a: 1 },
        updatedBy: Owner,
      },
      {
        sectionKey: 'EXECUTION',
        savedAt: new Date(),
        publishedAt: null,
        publishedSnapshot: null,
        updatedBy: Owner,
      },
    ]);
    const view = await new GetCharityPublicProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
      deps.events as never,
      deps.summaries as never,
    ).handle({
      idOrSlug: 'mua-dong-am',
      userId: null,
    });
    expect(view.bankAccounts.map((a) => a.accountId)).toEqual(['b1']);
    expect(view.itemNeeds[0]).toMatchObject({
      receiverName: null,
      receiverPhone: null,
    });
    expect(view.sections.find((s) => s.sectionKey === 'PLAN')).toMatchObject({
      published: true,
      content: { a: 1 },
    });
    expect(
      view.sections.find((s) => s.sectionKey === 'EXECUTION'),
    ).toMatchObject({ published: false, content: null });
    expect(view.myVolunteerRegistrations).toBeNull();
  });

  it('công khai mục Kế hoạch: bản chụp không có SĐT/địa chỉ bên thụ hưởng, không có người thụ hưởng cá nhân', async () => {
    const deps = make();
    const useCase = new PublishCharitySectionUseCase(
      deps.access,
      deps.projects as never,
      deps.engagement as never,
    );
    await useCase.handle({
      userId: Owner,
      campaignId: CampaignId,
      sectionKey: 'PLAN',
    });
    const snapshot = (
      deps.projects.publishSection.mock.calls[0][0] as {
        snapshot: { parties: unknown[] };
      }
    ).snapshot;
    expect(snapshot.parties).toEqual([
      expect.objectContaining({
        role: 'ORGANIZER',
        name: 'CLB B',
        hotline: '1900',
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('Bà A');
  });

  it('công khai mục chưa có nội dung → 409', async () => {
    const deps = make();
    await expect(
      new PublishCharitySectionUseCase(
        deps.access,
        deps.projects as never,
        deps.engagement as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        sectionKey: 'SUMMARY',
      }),
    ).rejects.toThrow(CharitySectionEmptyException);
  });
});
