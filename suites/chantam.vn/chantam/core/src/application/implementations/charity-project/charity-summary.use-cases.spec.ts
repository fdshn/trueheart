import {
  CharityCampaignNotFoundException,
  CharityEvaluationTargetInvalidException,
  CharityProjectForbiddenException,
  CharitySummaryEmptyException,
  CharitySummaryFinancialRequiredException,
  CharitySummaryNotOpenException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { CharityProjectAccess } from './charity-project.use-cases';
import {
  EvaluateCharityParticipantUseCase,
  GetCharityPromotionUseCase,
  GetCharitySummaryUseCase,
  GetMyCharityEvaluationUseCase,
  ListCharityMembersUseCase,
  PublishCharitySummaryUseCase,
  SaveCharitySummaryUseCase,
  SetCharityPromotionUseCase,
} from './charity-summary.use-cases';

const CampaignId = '2f7c0a52-61a6-4a43-9d4e-6a0cf1f2b001';
const Owner = '2f7c0a52-61a6-4a43-9d4e-6a0cf1f2b002';
const Walker = '2f7c0a52-61a6-4a43-9d4e-6a0cf1f2b003';

function make(stage: 'EVENT' | 'SUMMARY' = 'SUMMARY', adminWrite = false) {
  const campaign = {
    globalId: CampaignId,
    createdBy: Owner,
    approvalStatus: 'APPROVED',
    isActive: true,
    endTime: new Date(Date.now() + 86_400_000),
    operationStage: stage,
    acceptedContributionTypes: [],
  } as unknown as ICharityCampaign;
  const campaigns = {
    findByGlobalId: jest.fn(async () => campaign),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = {
    hasPermission: jest.fn(async () => adminWrite),
    getConfigValue: jest.fn(async () => 2),
  };
  const summaries = {
    getSummary: jest.fn(async (): Promise<unknown> => null),
    saveSummary: jest.fn(async (params: { content: unknown }) => ({
      ...(params.content as object),
      publishedAt: null,
    })),
    publishSummary: jest.fn(async () => ({ publishedAt: new Date() })),
    listFinancialReports: jest.fn(async (): Promise<unknown[]> => []),
    isEvaluationCandidate: jest.fn(async () => false),
    addEvaluation: jest.fn(async () => ({ completionScore: 80 })),
    latestEvaluation: jest.fn(async (): Promise<unknown> => null),
    setPromotion: jest.fn(async () => ({ featuredOnHome: true })),
    countParticipation: jest.fn(async () => ({
      registered: 12,
      checkedIn: 7,
      supervisorsCheckedIn: 2,
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
  const projects = {
    listFundingNeeds: jest.fn(async () => [] as unknown[]),
  };
  const realtime = { signal: jest.fn() };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { campaign, admin, summaries, projects, realtime, access };
}

const content = {
  summary: '  Đã trao 300 áo  ',
  usageReport: null,
  thanksMessage: null,
  lessonsLearned: null,
  evidenceUrls: [] as string[],
};

describe('Tổng kết', () => {
  it('chưa tới giai đoạn Tổng kết → không viết được', async () => {
    const deps = make('EVENT');
    await expect(
      new SaveCharitySummaryUseCase(
        deps.access,
        deps.summaries as never,
        deps.realtime,
      ).handle({ userId: Owner, campaignId: CampaignId, content }),
    ).rejects.toThrow(CharitySummaryNotOpenException);
  });

  it('bằng chứng không phải URL https → 400; nội dung được cắt khoảng trắng', async () => {
    const deps = make();
    const useCase = new SaveCharitySummaryUseCase(
      deps.access,
      deps.summaries as never,
      deps.realtime,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        content: { ...content, evidenceUrls: ['http://x'] },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await useCase.handle({ userId: Owner, campaignId: CampaignId, content });
    expect(deps.summaries.saveSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ summary: 'Đã trao 300 áo' }),
      }),
    );
  });

  it('công khai: rỗng → lỗi; có nhận tiền mà chưa có báo cáo → lỗi; đủ thì công khai và phát tín hiệu', async () => {
    const deps = make();
    const useCase = new PublishCharitySummaryUseCase(
      deps.access,
      deps.summaries as never,
      deps.projects as never,
      deps.realtime,
    );
    const command = { userId: Owner, campaignId: CampaignId };
    await expect(useCase.handle(command)).rejects.toThrow(
      CharitySummaryEmptyException,
    );
    deps.summaries.getSummary.mockResolvedValue({ summary: 'Xong' });
    deps.projects.listFundingNeeds.mockResolvedValue([
      { confirmedAmount: 1_000_000, externalAmount: 0 },
    ]);
    await expect(useCase.handle(command)).rejects.toThrow(
      CharitySummaryFinancialRequiredException,
    );
    deps.summaries.listFinancialReports.mockResolvedValue([{ reportId: 'r' }]);
    await expect(useCase.handle(command)).resolves.toBeDefined();
    expect(deps.realtime.signal).toHaveBeenCalledWith(
      CampaignId,
      ['SUMMARY'],
      'public',
    );
  });
});

describe('Chấm mức hoàn thành', () => {
  it('người không tham gia → lỗi; điểm ngoài 0–100 → 400', async () => {
    const deps = make();
    const useCase = new EvaluateCharityParticipantUseCase(
      deps.access,
      deps.summaries as never,
    );
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        participantId: Walker,
        completionScore: 120,
        note: null,
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
        participantId: Walker,
        completionScore: 80,
        note: null,
      }),
    ).rejects.toThrow(CharityEvaluationTargetInvalidException);
  });

  it('người được chấm thấy điểm của mình, KHÔNG thấy ghi chú', async () => {
    const deps = make();
    deps.summaries.latestEvaluation.mockResolvedValueOnce({
      evaluationId: 'e1',
      completionScore: 80,
      note: 'Đến muộn',
      createdAt: new Date(),
      version: 1,
    });
    const mine = await new GetMyCharityEvaluationUseCase(
      deps.summaries as never,
    ).handle({ userId: Walker, campaignId: CampaignId });
    expect(mine).toEqual(
      expect.objectContaining({ completionScore: 80, version: 1 }),
    );
    expect(mine).not.toHaveProperty('note');
  });
});

describe('Card Home', () => {
  const promotion = {
    featuredOnHome: true,
    featuredTitle: null,
    featuredMessage: null,
    featuredMediaUrl: null,
    featuredCta: null,
    featuredFrom: null,
    featuredUntil: null,
    featuredPriority: 0,
  };

  it('không phải Admin ghi → chặn; bật thiếu tiêu đề/CTA → 400', async () => {
    const plain = make();
    await expect(
      new SetCharityPromotionUseCase(
        plain.admin as never,
        plain.summaries as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        reason: 'x',
        promotion,
      }),
    ).rejects.toThrow(CharityProjectForbiddenException);
    const admin = make('SUMMARY', true);
    await expect(
      new SetCharityPromotionUseCase(
        admin.admin as never,
        admin.summaries as never,
      ).handle({
        userId: Owner,
        campaignId: CampaignId,
        reason: 'x',
        promotion,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});

describe('GetCharityPromotionUseCase', () => {
  function build(canRead: boolean, promotion: unknown) {
    const admin = { hasPermission: jest.fn(async () => canRead) };
    const summaries = { getPromotion: jest.fn(async () => promotion) };
    return {
      admin,
      summaries,
      useCase: new GetCharityPromotionUseCase(
        admin as never,
        summaries as never,
      ),
    };
  }

  it('đòi campaign.read', async () => {
    const { admin, summaries, useCase } = build(false, {});
    await expect(
      useCase.handle({ userId: Owner, campaignId: CampaignId }),
    ).rejects.toThrow(CharityProjectForbiddenException);
    expect(admin.hasPermission).toHaveBeenCalledWith(Owner, 'campaign.read');
    expect(summaries.getPromotion).not.toHaveBeenCalled();
  });

  it('trả cấu hình card hiện tại; dự án không có thì 404', async () => {
    const view = { featuredOnHome: true, featuredTitle: 'Áo ấm' };
    await expect(
      build(true, view).useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
      }),
    ).resolves.toBe(view);
    await expect(
      build(true, null).useCase.handle({
        userId: Owner,
        campaignId: CampaignId,
      }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
  });
});

describe('Tổng kết · giám sát viên so với tối thiểu (CR 22/11/2026)', () => {
  const board = (minimumSupervisors: number) => {
    const deps = make();
    (deps.campaign as { minimumSupervisors: number }).minimumSupervisors =
      minimumSupervisors;
    return new GetCharitySummaryUseCase(
      deps.access,
      deps.summaries as never,
      deps.projects as never,
    ).handle({ userId: Owner, campaignId: CampaignId });
  };

  it('board totals có 3 khối riêng, không có trường tổng chung', async () => {
    const deps = make();
    const board = await new GetCharitySummaryUseCase(
      deps.access,
      deps.summaries as never,
      deps.projects as never,
    ).handle({ userId: Owner, campaignId: CampaignId });
    expect(Object.keys(board.totals).sort()).toEqual([
      'material',
      'money',
      'service',
    ]);
  });

  it('tổng kết supervisors.checkedIn/minimumSupervisors, thiếu chỉ là met=false', async () => {
    const result = await board(3);
    expect(result.participation).toEqual({
      registeredCount: 12,
      checkedInCount: 7,
    });
    expect(result.supervisors).toEqual({
      checkedIn: 2,
      minimumSupervisors: 3,
      met: false,
    });
  });

  it('đối chiếu theo số giám sát viên ĐÃ check-in', async () => {
    expect((await board(2)).supervisors.met).toBe(true);
    expect((await board(3)).supervisors.met).toBe(false);
  });

  it('minimumSupervisors = 0 là không đặt — luôn đạt', async () => {
    expect((await board(0)).supervisors.met).toBe(true);
  });
});

describe('ListCharityMembersUseCase (CR 22/11/2026 — members công khai)', () => {
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 10, 23, 0, minute)).toISOString();
  const row = (userId: string, minute: number) => ({
    user: {
      globalId: userId,
      username: `u-${userId.slice(-3)}`,
      fullName: null,
      avatarUrl: null,
      rank: 'MEMBER',
      email: 'an@private.test',
    },
    joinedAt: new Date(at(minute)),
    contributionTypes: ['MATERIAL', 'SERVICE'],
  });
  const build = (visible: string | null = CampaignId) => {
    const summaries = {
      listPublicMembers: jest.fn(async (params: { limit: number }) => ({
        rows: [row('a-001', 1), row('a-002', 2), row('a-003', 3)].slice(
          0,
          params.limit,
        ),
        anonymousCount: 4,
      })),
    };
    const projects = { findVisibleCampaignId: jest.fn(async () => visible) };
    return {
      summaries,
      projects,
      useCase: new ListCharityMembersUseCase(
        summaries as never,
        projects as never,
      ),
    };
  };

  it('members chưa công khai → 404', async () => {
    const { useCase, summaries } = build(null);
    await expect(
      useCase.handle({ idOrSlug: 'nhap', type: 'CONTRIBUTOR', limit: 20 }),
    ).rejects.toThrow(CharityCampaignNotFoundException);
    expect(summaries.listPublicMembers).not.toHaveBeenCalled();
  });

  it('dòng đi qua toPublicUserProfile (năm trường), giữ contributionTypes, anonymousCount', async () => {
    const { useCase } = build();
    const result = await useCase.handle({
      idOrSlug: CampaignId,
      type: 'CONTRIBUTOR',
      limit: 20,
    });
    expect(result.members[0]).toEqual({
      user: {
        userId: 'a-001',
        username: 'u-001',
        displayName: 'u-001',
        avatarUrl: null,
        rank: 'MEMBER',
      },
      joinedAt: new Date(at(1)),
      contributionTypes: ['MATERIAL', 'SERVICE'],
    });
    expect(result.anonymousCount).toBe(4);
    expect(result.nextCursor).toBeNull();
    expect(JSON.stringify(result)).not.toContain('private.test');
  });

  it('PARTICIPANT không mang contributionTypes', async () => {
    const { useCase } = build();
    const result = await useCase.handle({
      idOrSlug: CampaignId,
      type: 'PARTICIPANT',
      limit: 20,
    });
    expect(result.members[0]).not.toHaveProperty('contributionTypes');
  });

  it('cursor trang 2 không lặp dòng: hỏi limit+1, nextCursor = base64url(joinedAt|userId) của dòng cuối trả về', async () => {
    const { useCase, summaries } = build();
    const first = await useCase.handle({
      idOrSlug: CampaignId,
      type: 'SUPERVISOR',
      limit: 2,
    });
    expect(summaries.listPublicMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 3, cursor: null, type: 'SUPERVISOR' }),
    );
    expect(first.members.map((member) => member.user.userId)).toEqual([
      'a-001',
      'a-002',
    ]);
    expect(first.nextCursor).toBe(
      Buffer.from(`${at(2)}|a-002`).toString('base64url'),
    );
    await useCase.handle({
      idOrSlug: CampaignId,
      type: 'SUPERVISOR',
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(summaries.listPublicMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { joinedAt: new Date(at(2)), userId: 'a-002' },
      }),
    );
  });

  it('cursor hỏng → 400', async () => {
    const { useCase } = build();
    await expect(
      useCase.handle({
        idOrSlug: CampaignId,
        type: 'CONTRIBUTOR',
        limit: 20,
        cursor: 'không-phải-cursor',
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});
