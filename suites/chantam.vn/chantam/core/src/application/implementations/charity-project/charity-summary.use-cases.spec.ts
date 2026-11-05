import {
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
  GetMyCharityEvaluationUseCase,
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
  } as ICharityCampaign;
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
