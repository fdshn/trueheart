import {
  CharityBankAccountLimitException,
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotDraftException,
  CharitySectionEmptyException,
  CharityStageScheduleConflictException,
  CharityStageTransitionInvalidException,
  CharityVolunteerClosedException,
  CharityVolunteerNotEligibleException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  AddCharityBankAccountUseCase,
  AdvanceCharityStagesUseCase,
  CharityProjectAccess,
  GetCharityPublicProjectUseCase,
  GetCharityWorkspaceUseCase,
  MoveCharityStageUseCase,
  PublishCharitySectionUseCase,
  RegisterCharityVolunteerUseCase,
  ReplaceCharityCustomSectionsUseCase,
  ReplaceCharityPartiesUseCase,
  ReplaceCharityPhasesUseCase,
  SubmitCharityProjectUseCase,
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
    beneficiaryRelation: null,
    allowOverTarget: false,
    submittedAt: new Date(),
    operationStage: 'EXECUTION',
    storedOperationStage: 'EXECUTION',
    distribution: null,
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
      maxBankAccounts: null,
    })),
    submitDraft: jest.fn(async (..._args: unknown[]) => 'SUBMITTED'),
    moveStage: jest.fn(async (..._args: unknown[]) => 'MOVED'),
    listStageCandidates: jest.fn(async () => [] as unknown[]),
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
  return {
    campaigns,
    admin,
    projects,
    entitlements,
    access,
    engagement,
    events,
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

describe('MoveCharityStageUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new MoveCharityStageUseCase(
      deps.access,
      deps.projects as never,
      deps.campaigns as never,
    );
  const cmd = (
    to: 'EXECUTION' | 'EVENT' | 'SUMMARY',
    reason: string | null = null,
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

  it('lùi phải có lý do', async () => {
    const deps = make({
      campaign: campaign({
        operationStage: 'EVENT',
        storedOperationStage: 'EVENT',
      }),
    });
    await expect(build(deps).handle(cmd('EXECUTION'))).rejects.toThrow(
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

describe('AdvanceCharityStagesUseCase', () => {
  it('chỉ chuyển dự án đã tới mốc; chạy khô không ghi', async () => {
    const deps = make();
    deps.projects.listStageCandidates.mockResolvedValue([
      {
        campaignId: 'a',
        stored: 'EXECUTION',
        endTime: new Date(Date.now() - Hour),
        distribution: null,
      },
      {
        campaignId: 'b',
        stored: 'EXECUTION',
        endTime: new Date(Date.now() + Hour),
        distribution: null,
      },
    ]);
    const useCase = new AdvanceCharityStagesUseCase(deps.projects as never);
    await expect(useCase.handle({ limit: 10, dryRun: true })).resolves.toEqual({
      advanced: 1,
      checked: 2,
    });
    expect(deps.projects.moveStage).not.toHaveBeenCalled();
    await expect(useCase.handle({ limit: 10, dryRun: false })).resolves.toEqual(
      { advanced: 1, checked: 2 },
    );
    expect(deps.projects.moveStage).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'a',
        from: 'EXECUTION',
        to: 'SUMMARY',
        actorId: null,
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

  it('bước trao đã bắt đầu → không nhận đăng ký mới', async () => {
    await expect(
      build(make({ campaign: campaign({ operationStage: 'EVENT' }) })).handle(
        cmd,
      ),
    ).rejects.toThrow(CharityVolunteerClosedException);
  });

  it.each([
    ['NOT_ELIGIBLE', CharityVolunteerNotEligibleException],
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
