import {
  CharityCampaignNotFoundException,
  CharityExportNotFoundException,
  CharityProjectNotApprovedException,
  CharitySectionNotPublishedException,
  CharityTaskNotFoundException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  CreateCharityExportUseCase,
  CreateCharityShareLinkUseCase,
  FollowCharityProjectUseCase,
  GetCharityExportPdfUseCase,
  ListCharityRevisionsUseCase,
  ProcessCharityAnnouncementsUseCase,
  UpdateCharityTaskUseCase,
} from './charity-engagement.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '0f7c0a52-61a6-4a43-9d4e-6a0cf1f2b001';
const Owner = '0f7c0a52-61a6-4a43-9d4e-6a0cf1f2b002';
const Viewer = '0f7c0a52-61a6-4a43-9d4e-6a0cf1f2b003';

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  const now = Date.now();
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    slug: 'mua-dong-am',
    description: 'Gom áo ấm cho học sinh vùng cao trước mùa rét.',
    bannerUrl: null,
    badgeName: 'Trái tim vàng',
    targetItemsCount: 100,
    currentItemsCount: 0,
    progressPercent: 0,
    lat: null,
    lng: null,
    locationLabel: 'Hà Giang',
    startTime: new Date(now - 86_400_000),
    endTime: new Date(now + 10 * 86_400_000),
    isActive: true,
    approvalStatus: 'APPROVED',
    approvalNote: null,
    approvedAt: new Date(),
    approvedBy: null,
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
  } as ICharityCampaign;
}

function make(current: ICharityCampaign | null = campaign()) {
  const campaigns = {
    findByGlobalId: jest.fn(async () => current),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = {
    hasPermission: jest.fn(async () => false),
    getConfigValue: jest.fn(async () => 2),
  };
  const projects = {
    findVisibleCampaignId: jest.fn(async () => current?.globalId ?? null),
    listSectionStates: jest.fn(async () => [] as unknown[]),
    listCustomSections: jest.fn(async () => []),
    getProfile: jest.fn(async () => null),
    listParties: jest.fn(async () => []),
    listTeam: jest.fn(async () => []),
    listPhases: jest.fn(async () => []),
    listItemNeeds: jest.fn(async () => [
      {
        itemName: 'Áo',
        unit: 'chiếc',
        targetQuantity: 10,
        receivedInAppQuantity: 2,
        receivedExternalQuantity: 1,
        remainingQuantity: 7,
        isActive: true,
      },
      {
        itemName: 'Đã tắt',
        unit: 'chiếc',
        targetQuantity: 5,
        receivedInAppQuantity: 0,
        receivedExternalQuantity: 0,
        remainingQuantity: 5,
        isActive: false,
      },
    ]),
    listFundingNeeds: jest.fn(async () => []),
    listVolunteerNeeds: jest.fn(async () => []),
    listBankAccounts: jest.fn(async () => [
      {
        bankName: 'VCB',
        accountNo: '1',
        accountName: 'A',
        label: null,
        validTo: null,
      },
      {
        bankName: 'ACB',
        accountNo: '2',
        accountName: 'B',
        label: null,
        validTo: new Date(),
      },
    ]),
  };
  const engagement = {
    ensureTasks: jest.fn(async (..._args: unknown[]) => undefined),
    taskScheduleInputs: jest.fn(async () => ({
      earliestIntakeDeadline: null,
      distributionStartsAt: null,
    })),
    listTasks: jest.fn(async () => []),
    updateTask: jest.fn(async (..._args: unknown[]): Promise<unknown> => null),
    listRevisions: jest.fn(
      async (..._args: unknown[]): Promise<unknown[]> => [],
    ),
    follow: jest.fn(async () => true),
    unfollow: jest.fn(async () => true),
    counters: jest.fn(async () => ({
      reactionCount: 0,
      commentCount: 0,
      followerCount: 3,
    })),
    createExport: jest.fn(async (params: Record<string, unknown>) => ({
      exportId: 'e1',
      campaignId: CampaignId,
      sectionKey: params.sectionKey,
      snapshot: params.snapshot,
      lastRevisionId: null,
      generatedBy: Owner,
      generatedAt: new Date(),
    })),
    findExport: jest.fn(async (): Promise<unknown> => null),
    listPreEventCandidates: jest.fn(async (): Promise<unknown[]> => []),
    enqueueAnnouncement: jest.fn(async (..._args: unknown[]) => true),
    processPendingAnnouncements: jest.fn(
      async (
        _limit: number,
        _handler: (announcement: unknown) => Promise<number>,
      ) => 0,
    ),
    listAudience: jest.fn(async (..._args: unknown[]) => [Viewer, Owner]),
  };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { campaigns, admin, projects, engagement, access };
}

describe('Checklist tab B', () => {
  it('dự án chưa duyệt → không cập nhật được', async () => {
    const deps = make(campaign({ approvalStatus: 'PENDING_APPROVAL' }));
    await expect(
      new UpdateCharityTaskUseCase(
        deps.access,
        deps.engagement as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        taskId: 't1',
        patch: {},
      }),
    ).rejects.toThrow(CharityProjectNotApprovedException);
  });

  it('việc không có → 404; ghi chú được cắt khoảng trắng, chuỗi rỗng thành null', async () => {
    const deps = make();
    const useCase = new UpdateCharityTaskUseCase(
      deps.access,
      deps.engagement as never,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        taskId: 't1',
        patch: { workNote: '  xong  ', remark: '   ' },
      }),
    ).rejects.toThrow(CharityTaskNotFoundException);
    expect(deps.engagement.ensureTasks).toHaveBeenCalled();
    expect(deps.engagement.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({ workNote: 'xong', remark: null }),
      }),
    );
  });

  it('người lạ không có vai → 404', async () => {
    const deps = make();
    await expect(
      new UpdateCharityTaskUseCase(
        deps.access,
        deps.engagement as never,
      ).handle({
        userId: Viewer,
        campaignId: CampaignId,
        taskId: 't1',
        patch: {},
      }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('Changelog', () => {
  const revision = (id: string) => ({
    revisionId: id,
    entity: 'PHASE',
    entityId: 'DISTRIBUTION',
    field: 'startsAt',
    oldValue: 'a',
    newValue: 'b',
    isPublic: true,
    isImportant: true,
    changedBy: Owner,
    reason: null,
    createdAt: new Date(),
  });

  it('công khai: chỉ revision công khai, giấu người sửa, có con trỏ trang sau', async () => {
    const deps = make();
    deps.engagement.listRevisions.mockResolvedValueOnce([
      revision('r3'),
      revision('r2'),
      revision('r1'),
    ]);
    const page = await new ListCharityRevisionsUseCase(
      deps.access,
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
    ).handle({
      idOrSlug: 'mua-dong-am',
      userId: null,
      scope: 'PUBLIC',
      beforeRevisionId: null,
      limit: 2,
    });
    expect(deps.engagement.listRevisions).toHaveBeenCalledWith(
      expect.objectContaining({ publicOnly: true, limit: 3 }),
    );
    expect(page.revisions.map((r) => r.revisionId)).toEqual(['r3', 'r2']);
    expect(page.revisions.every((r) => r.changedBy === null)).toBe(true);
    expect(page.nextBefore).toBe('r2');
  });

  it('dự án không hiện ra ngoài → 404', async () => {
    const deps = make(null);
    await expect(
      new ListCharityRevisionsUseCase(
        deps.access,
        deps.campaigns as never,
        deps.projects as never,
        deps.engagement as never,
      ).handle({
        idOrSlug: 'x',
        userId: null,
        scope: 'PUBLIC',
        beforeRevisionId: null,
        limit: 10,
      }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('Quan tâm', () => {
  it('dự án đã đóng: không quan tâm mới, nhưng bỏ quan tâm được', async () => {
    const deps = make(
      campaign({ isActive: false, endTime: new Date(Date.now() - 1000) }),
    );
    const useCase = new FollowCharityProjectUseCase(
      deps.campaigns as never,
      deps.projects as never,
      deps.engagement as never,
    );
    await expect(
      useCase.handle({ idOrSlug: 'x', userId: Viewer, follow: true }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
    await expect(
      useCase.handle({ idOrSlug: 'x', userId: Viewer, follow: false }),
    ).resolves.toEqual({ following: false, followerCount: 3 });
  });
});

describe('Chia sẻ', () => {
  const build = (
    deps: ReturnType<typeof make>,
    shares = { recordShare: jest.fn(async () => ({ shareCount: 0 })) },
  ) => ({
    shares,
    useCase: new CreateCharityShareLinkUseCase(
      deps.campaigns as never,
      deps.projects as never,
      shares as never,
      { web: { publicBaseUrl: 'https://chantam.vn' } } as never,
    ),
  });

  it('mục chưa công khai → không chia sẻ được, không ghi lượt chia sẻ', async () => {
    const deps = make();
    const { useCase, shares } = build(deps);
    await expect(
      useCase.handle({
        idOrSlug: 'x',
        userId: Viewer,
        sectionKey: 'EXECUTION',
        channel: null,
      }),
    ).rejects.toThrow(CharitySectionNotPublishedException);
    expect(shares.recordShare).not.toHaveBeenCalled();
  });

  it('cả dự án: link /c/{slug}, ghi một lượt chia sẻ', async () => {
    const deps = make();
    const { useCase, shares } = build(deps);
    await expect(
      useCase.handle({
        idOrSlug: 'x',
        userId: Viewer,
        sectionKey: null,
        channel: ' ZALO ',
      }),
    ).resolves.toEqual({
      sectionKey: null,
      sharePath: '/c/mua-dong-am',
      shareUrl: 'https://chantam.vn/c/mua-dong-am',
    });
    expect(shares.recordShare).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'CHARITY_CAMPAIGN',
        channel: 'ZALO',
      }),
    );
  });
});

describe('Bản in', () => {
  it('bản chụp bỏ hiện vật đã tắt và tài khoản đã đóng', async () => {
    const deps = make();
    const view = await new CreateCharityExportUseCase(
      deps.access,
      deps.projects as never,
      deps.engagement as never,
    ).handle({ userId: Owner, campaignId: CampaignId, sectionKey: 'PLAN' });
    const snapshot = (
      deps.engagement.createExport.mock.calls[0][0] as {
        snapshot: {
          itemNeeds: { itemName: string; receivedQuantity: number }[];
          bankAccounts: unknown[];
          sections: unknown[];
        };
      }
    ).snapshot;
    expect(snapshot.itemNeeds).toEqual([
      expect.objectContaining({ itemName: 'Áo', receivedQuantity: 3 }),
    ]);
    expect(snapshot.bankAccounts).toHaveLength(1);
    expect(snapshot.sections).toHaveLength(1);
    expect(view.downloadPath).toBe(
      `/charity-campaigns/${CampaignId}/exports/e1/pdf`,
    );
  });

  it('tải bản in không có → 404', async () => {
    const deps = make();
    await expect(
      new GetCharityExportPdfUseCase(
        deps.access,
        deps.engagement as never,
        { findByGlobalIds: jest.fn(async () => []) } as never,
        { render: jest.fn() } as never,
      ).handle({ userId: Owner, campaignId: CampaignId, exportId: 'e9' }),
    ).rejects.toThrow(CharityExportNotFoundException);
  });
});

describe('Thông báo theo dự án', () => {
  const dispatch = () => ({
    handle: jest.fn(async (command: { userId: string }) => {
      if (command.userId === 'hỏng') throw new Error('push');
      return { created: true, pushedDevices: 0 };
    }),
  });

  it('chạy khô chỉ đếm, không xếp và không gửi', async () => {
    const deps = make();
    deps.engagement.listPreEventCandidates.mockResolvedValueOnce([
      { campaignId: CampaignId, distributionStartsAt: new Date() },
    ]);
    const result = await new ProcessCharityAnnouncementsUseCase(
      deps.campaigns as never,
      deps.engagement as never,
      dispatch() as never,
    ).handle({ dryRun: true, limit: 10 });
    expect(result).toEqual({ preEventQueued: 1, processed: 0, notified: 0 });
    expect(deps.engagement.enqueueAnnouncement).not.toHaveBeenCalled();
    expect(deps.engagement.processPendingAnnouncements).not.toHaveBeenCalled();
  });

  it('xếp nhắc 48 giờ với khoá chống trùng là mốc trao; gửi tới cả nhóm, lỗi một người không làm hỏng lượt', async () => {
    const deps = make();
    const startsAt = new Date('2026-12-20T01:00:00Z');
    deps.engagement.listPreEventCandidates.mockResolvedValueOnce([
      { campaignId: CampaignId, distributionStartsAt: startsAt },
    ]);
    deps.engagement.listAudience.mockResolvedValueOnce([Viewer, 'hỏng']);
    const sender = dispatch();
    let handled = -1;
    deps.engagement.processPendingAnnouncements.mockImplementationOnce(
      async (_limit, handler) => {
        handled = await handler({
          announcementId: 'a1',
          campaignId: CampaignId,
          kind: 'PRE_EVENT',
          payload: { distributionStartsAt: startsAt.toISOString() },
          actorId: Owner,
          createdAt: new Date(),
        });
        return 1;
      },
    );
    const result = await new ProcessCharityAnnouncementsUseCase(
      deps.campaigns as never,
      deps.engagement as never,
      sender as never,
    ).handle({ dryRun: false, limit: 10 });
    expect(deps.engagement.enqueueAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'PRE_EVENT',
        dedupeKey: String(startsAt.getTime()),
      }),
    );
    expect(deps.engagement.listAudience).toHaveBeenCalledWith({
      campaignId: CampaignId,
      excludeUserId: Owner,
    });
    expect(sender.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: Viewer,
        type: NotificationTypes.CHARITY_PRE_EVENT_NOTICE,
        idempotencyKey: `${NotificationTypes.CHARITY_PRE_EVENT_NOTICE}:a1:${Viewer}`,
      }),
    );
    expect(handled).toBe(1);
    expect(result).toEqual({ preEventQueued: 1, processed: 1, notified: 1 });
  });

  it('dự án bị đình chỉ sau khi xếp → đánh dấu xong, không báo ai', async () => {
    const deps = make(campaign({ isActive: false }));
    const sender = dispatch();
    let handled = -1;
    deps.engagement.processPendingAnnouncements.mockImplementationOnce(
      async (_limit, handler) => {
        handled = await handler({
          announcementId: 'a2',
          campaignId: CampaignId,
          kind: 'STAGE_CHANGED',
          payload: { from: 'EXECUTION', to: 'EVENT' },
          actorId: null,
          createdAt: new Date(),
        });
        return 1;
      },
    );
    await new ProcessCharityAnnouncementsUseCase(
      deps.campaigns as never,
      deps.engagement as never,
      sender as never,
    ).handle({ dryRun: false, limit: 10 });
    expect(handled).toBe(0);
    expect(sender.handle).not.toHaveBeenCalled();
  });

  it('kế hoạch đổi: câu thông báo nói ĐÚNG phần đổi, không mang giá trị', async () => {
    const deps = make();
    const sender = dispatch();
    deps.engagement.listAudience.mockResolvedValueOnce([Viewer]);
    deps.engagement.processPendingAnnouncements.mockImplementationOnce(
      async (_limit, handler) => {
        await handler({
          announcementId: 'a3',
          campaignId: CampaignId,
          kind: 'PLAN_CHANGED',
          payload: {
            changes: [
              { entity: 'BANK_ACCOUNT', field: 'accountNo' },
              { entity: 'PHASE', field: 'startsAt' },
            ],
          },
          actorId: Owner,
          createdAt: new Date(),
        });
        return 1;
      },
    );
    await new ProcessCharityAnnouncementsUseCase(
      deps.campaigns as never,
      deps.engagement as never,
      sender as never,
    ).handle({ dryRun: false, limit: 10 });
    const body = (sender.handle.mock.calls[0][0] as unknown as { body: string })
      .body;
    expect(body).toContain('tài khoản nhận tiền');
    expect(body).toContain('thời gian trao');
  });
});
