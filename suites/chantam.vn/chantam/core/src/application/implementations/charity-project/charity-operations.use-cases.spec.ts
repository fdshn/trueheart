import {
  CharityRoundInvalidStateException,
  CharityStageTransitionInvalidException,
  CharitySupportNeedClosedException,
  CharitySupportOfferInvalidStateException,
  CharitySupportOfferNotFoundException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { charityRoundWarnings } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  DecideCharitySupportOfferUseCase,
  OfferCharitySupportUseCase,
  PostponeCharityDistributionUseCase,
  SaveCharityRoundUseCase,
  SaveCharitySupportNeedUseCase,
  SetCharityRoundReadinessUseCase,
  SetCharityRoundStatusUseCase,
  WithdrawCharitySupportOfferUseCase,
} from './charity-operations.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d001';
const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d002';
const Helper = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2d003';
const Hour = 3_600_000;

function campaign(overrides: Partial<ICharityCampaign> = {}): ICharityCampaign {
  return {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
    createdBy: Owner,
    approvalStatus: 'APPROVED',
    isActive: true,
    endTime: new Date(Date.now() + 30 * 24 * Hour),
    operationStage: 'EXECUTION',
    ...overrides,
  } as ICharityCampaign;
}

const need = (status = 'OPEN') => ({
  supportNeedId: 'n1',
  campaignId: CampaignId,
  status,
  external: { quantity: 0, evidenceUrls: [], note: null },
});

const offer = (status: string, overrides: Record<string, unknown> = {}) => ({
  offerId: 'o1',
  supportNeedId: 'n1',
  campaignId: CampaignId,
  user: { userId: Helper, username: 'h', fullName: null, avatarUrl: null },
  quantity: 4,
  status,
  decisionReason: null,
  ...overrides,
});

const round = (overrides: Record<string, unknown> = {}) => ({
  roundId: 'r1',
  campaignId: CampaignId,
  title: 'Đợt 1',
  locationLabel: 'Xã A',
  address: null,
  startsAt: new Date(Date.now() + 72 * Hour),
  endsAt: new Date(Date.now() + 80 * Hour),
  status: 'PLANNED',
  readiness: 'PENDING',
  checklist: [],
  ...overrides,
});

function make(current = campaign()) {
  const campaigns = {
    findByGlobalId: jest.fn(async () => current),
    isCampaignManager: jest.fn(async () => false),
  };
  const admin = { hasPermission: jest.fn(async () => false) };
  const operations = {
    findSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    createSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    updateSupportNeed: jest.fn(async (): Promise<unknown> => need()),
    createOffer: jest.fn(async (): Promise<unknown> => offer('PENDING')),
    findOffer: jest.fn(async (): Promise<unknown> => offer('PENDING')),
    transitionOffer: jest.fn(async (params: { to: string }): Promise<unknown> =>
      offer(params.to),
    ),
    findRound: jest.fn(async (): Promise<unknown> => round()),
    createRound: jest.fn(async (): Promise<unknown> => round()),
    updateRound: jest.fn(async (): Promise<unknown> => round()),
    setRoundStatus: jest.fn(async (): Promise<unknown> => round()),
    setRoundReadiness: jest.fn(async (): Promise<unknown> => round()),
  };
  const projects = {
    listPhases: jest.fn(async (): Promise<unknown[]> => [
      {
        phase: 'DISTRIBUTION',
        startsAt: new Date(Date.now() + 24 * Hour),
        endsAt: new Date(Date.now() + 30 * Hour),
      },
    ]),
    replacePhases: jest.fn(async (): Promise<unknown[]> => []),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { campaigns, operations, projects, notifier, access };
}

const cmd = { userId: Owner, campaignId: CampaignId };

describe('Hỗ trợ mở', () => {
  it('nguồn ngoài app > 0 mà thiếu bằng chứng / không phải https → 400', async () => {
    const deps = make();
    const useCase = new SaveCharitySupportNeedUseCase(
      deps.access,
      deps.operations as never,
    );
    const base = {
      ...cmd,
      supportNeedId: 'n1',
      need: {
        supportType: 'TRANSPORT' as const,
        title: 'Xe 16 chỗ',
        description: null,
        unit: 'chuyến',
        targetQuantity: 2,
        startsAt: null,
        endsAt: null,
        locationLabel: null,
        requirements: null,
        handoverMethod: null,
        picName: null,
        picPhone: null,
        sortOrder: 0,
      },
    };
    await expect(
      useCase.handle({
        ...base,
        external: { quantity: 1, evidenceUrls: [], note: null },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        ...base,
        external: { quantity: 1, evidenceUrls: ['http://x'], note: null },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await useCase.handle({
      ...base,
      external: { quantity: 1, evidenceUrls: ['https://x/a.png'], note: null },
    });
    expect(deps.operations.updateSupportNeed).toHaveBeenCalled();
  });

  it('nhận hỗ trợ: hạng mục đóng / dự án ở Tổng kết → chặn', async () => {
    const closed = make();
    closed.operations.findSupportNeed.mockResolvedValueOnce(need('CLOSED'));
    const offerCmd = {
      userId: Helper,
      campaignId: CampaignId,
      supportNeedId: 'n1',
      quantity: 1,
      note: null,
    };
    await expect(
      new OfferCharitySupportUseCase(
        closed.campaigns as never,
        closed.operations as never,
      ).handle(offerCmd),
    ).rejects.toThrow(CharitySupportNeedClosedException);
    const summary = make(campaign({ operationStage: 'SUMMARY' }));
    await expect(
      new OfferCharitySupportUseCase(
        summary.campaigns as never,
        summary.operations as never,
      ).handle(offerCmd),
    ).rejects.toThrow(CharitySupportNeedClosedException);
  });

  it('ghi hoàn thành: mặc định đủ số; vượt số đã nhận → 400; từ chối thiếu lý do → 400', async () => {
    const deps = make();
    deps.operations.findOffer.mockResolvedValue(offer('ACCEPTED'));
    const useCase = new DecideCharitySupportOfferUseCase(
      deps.access,
      deps.operations as never,
      deps.notifier as never,
    );
    await useCase.handle({
      ...cmd,
      offerId: 'o1',
      action: 'COMPLETE',
      reason: null,
      completedQuantity: null,
    });
    expect(deps.operations.transitionOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'COMPLETED', completedQuantity: 4 }),
    );
    expect(deps.notifier.notify).toHaveBeenCalled();
    await expect(
      useCase.handle({
        ...cmd,
        offerId: 'o1',
        action: 'COMPLETE',
        reason: null,
        completedQuantity: 5,
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      useCase.handle({
        ...cmd,
        offerId: 'o1',
        action: 'REJECT',
        reason: ' ',
        completedQuantity: null,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('nhận lại đề nghị đã hoàn thành → 409', async () => {
    const deps = make();
    deps.operations.findOffer.mockResolvedValue(offer('COMPLETED'));
    await expect(
      new DecideCharitySupportOfferUseCase(
        deps.access,
        deps.operations as never,
        deps.notifier as never,
      ).handle({
        ...cmd,
        offerId: 'o1',
        action: 'ACCEPT',
        reason: null,
        completedQuantity: null,
      }),
    ).rejects.toThrow(CharitySupportOfferInvalidStateException);
  });

  it('rút đề nghị: của người khác → 404; đã hoàn thành → 409', async () => {
    const deps = make();
    const useCase = new WithdrawCharitySupportOfferUseCase(
      deps.operations as never,
    );
    await expect(
      useCase.handle({ userId: Owner, campaignId: CampaignId, offerId: 'o1' }),
    ).rejects.toThrow(CharitySupportOfferNotFoundException);
    deps.operations.findOffer.mockResolvedValueOnce(offer('COMPLETED'));
    await expect(
      useCase.handle({ userId: Helper, campaignId: CampaignId, offerId: 'o1' }),
    ).rejects.toThrow(CharitySupportOfferInvalidStateException);
    await useCase.handle({
      userId: Helper,
      campaignId: CampaignId,
      offerId: 'o1',
    });
    expect(deps.operations.transitionOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'WITHDRAWN' }),
    );
  });
});

describe('Hoãn bước trao', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new PostponeCharityDistributionUseCase(deps.access, deps.projects as never);

  it('dời về sau, giữ độ dài, ghi lý do vào lịch sử', async () => {
    const deps = make();
    const startsAt = new Date(Date.now() + 48 * Hour);
    await build(deps).handle({
      ...cmd,
      startsAt,
      endsAt: null,
      reason: 'Mưa lũ',
    });
    const call = deps.projects.replacePhases.mock.calls[0] as unknown as [
      {
        phases: { phase: string; startsAt: Date; endsAt: Date }[];
        reason: string;
      },
    ];
    const distribution = call[0].phases.find(
      (phase) => phase.phase === 'DISTRIBUTION',
    );
    expect(call[0].reason).toBe('Mưa lũ');
    expect(distribution?.endsAt.getTime()).toBe(startsAt.getTime() + 6 * Hour);
  });

  it('thiếu lý do / mốc sớm hơn → 400; đã ở Sự kiện trao → không hoãn được', async () => {
    await expect(
      build(make()).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 48 * Hour),
        endsAt: null,
        reason: ' ',
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(make()).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 2 * Hour),
        endsAt: null,
        reason: 'Sớm hơn',
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(make(campaign({ operationStage: 'EVENT' }))).handle({
        ...cmd,
        startsAt: new Date(Date.now() + 48 * Hour),
        endsAt: null,
        reason: 'Hoãn',
      }),
    ).rejects.toThrow(CharityStageTransitionInvalidException);
  });
});

describe('Đợt trao', () => {
  it('đổi giờ đợt của dự án đã duyệt: bắt buộc lý do, có lý do thì báo người của đợt', async () => {
    const deps = make();
    const useCase = new SaveCharityRoundUseCase(
      deps.access,
      deps.operations as never,
    );
    const moved = {
      ...cmd,
      roundId: 'r1',
      round: {
        title: 'Đợt 1',
        locationLabel: 'Xã A',
        address: null,
        startsAt: new Date(Date.now() + 96 * Hour),
        endsAt: new Date(Date.now() + 100 * Hour),
      },
    };
    await expect(useCase.handle({ ...moved, reason: null })).rejects.toThrow(
      ValidationFailedException,
    );
    await useCase.handle({ ...moved, reason: 'Đường sạt lở' });
    expect(deps.operations.updateRound).toHaveBeenCalledWith(
      expect.objectContaining({ announce: true, reason: 'Đường sạt lở' }),
    );
  });

  it('huỷ đợt thiếu lý do → 400; đợt đã huỷ → không sửa được', async () => {
    const deps = make();
    await expect(
      new SetCharityRoundStatusUseCase(
        deps.access,
        deps.operations as never,
      ).handle({ ...cmd, roundId: 'r1', status: 'CANCELLED', reason: null }),
    ).rejects.toThrow(ValidationFailedException);
    deps.operations.findRound.mockResolvedValueOnce(
      round({ status: 'CANCELLED' }),
    );
    await expect(
      new SetCharityRoundReadinessUseCase(
        deps.access,
        deps.operations as never,
      ).handle({
        ...cmd,
        roundId: 'r1',
        readiness: 'READY',
        note: null,
        checklist: [],
      }),
    ).rejects.toThrow(CharityRoundInvalidStateException);
  });

  it('chưa sẵn sàng phải có ghi chú; checklist gộp với mục cũ', async () => {
    const deps = make();
    const useCase = new SetCharityRoundReadinessUseCase(
      deps.access,
      deps.operations as never,
    );
    await expect(
      useCase.handle({
        ...cmd,
        roundId: 'r1',
        readiness: 'NOT_READY',
        note: null,
        checklist: [],
      }),
    ).rejects.toThrow(ValidationFailedException);
    await useCase.handle({
      ...cmd,
      roundId: 'r1',
      readiness: 'READY',
      note: null,
      checklist: [{ key: 'TRANSPORT', done: true }],
    });
    const call = deps.operations.setRoundReadiness.mock.calls[0] as unknown as [
      { checklist: { key: string; done: boolean }[] },
    ];
    expect(call[0].checklist).toHaveLength(6);
    expect(
      call[0].checklist.find((item) => item.key === 'TRANSPORT')?.done,
    ).toBe(true);
  });

  it('cảnh báo trước 48 giờ: chưa xác nhận + checklist chưa xong; xa hơn 48 giờ thì không', () => {
    const now = new Date();
    const soon = {
      status: 'PLANNED' as const,
      startsAt: new Date(now.getTime() + 24 * Hour),
      readiness: 'PENDING' as const,
      checklist: [{ key: 'TRANSPORT' as const, done: false, note: null }],
      now,
    };
    expect(charityRoundWarnings(soon)).toEqual([
      'READINESS_NOT_CONFIRMED',
      'CHECKLIST_INCOMPLETE',
    ]);
    expect(
      charityRoundWarnings({
        ...soon,
        startsAt: new Date(now.getTime() + 72 * Hour),
      }),
    ).toEqual([]);
    expect(
      charityRoundWarnings({
        ...soon,
        readiness: 'NOT_READY',
        startsAt: new Date(now.getTime() + 72 * Hour),
      }),
    ).toEqual(['NOT_READY']);
  });
});
