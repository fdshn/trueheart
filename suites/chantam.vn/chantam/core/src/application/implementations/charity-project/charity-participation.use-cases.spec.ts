import {
  CharityParticipationInvalidStateException,
  CharityParticipationNotFoundException,
  CharityParticipationStageNotAllowedException,
  CharityProjectForbiddenException,
} from '@/domain/exceptions';
import { ICharityCampaign } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  CheckInCharityParticipationUseCase,
  DecideCharityParticipationUseCase,
} from './charity-participation.use-cases';
import { CharityProjectAccess } from './charity-project.use-cases';

const CampaignId = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2c001';
const Owner = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2c002';
const Walker = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2c003';
const Stranger = '3f7c0a52-61a6-4a43-9d4e-6a0cf1f2c004';

function participation(
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    participationId: 'p1',
    campaignId: CampaignId,
    user: {
      userId: Walker,
      username: 'walker',
      fullName: null,
      avatarUrl: null,
    },
    status,
    statusChangedAt: new Date(),
    statusReason: null,
    ...overrides,
  };
}

function make(current: string | null = 'REGISTERED', stage = 'EVENT') {
  const campaign = {
    globalId: CampaignId,
    title: 'Mùa đông ấm',
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
  const admin = { hasPermission: jest.fn(async () => false) };
  const participations = {
    find: jest.fn(async (): Promise<unknown> =>
      current ? participation(current) : null,
    ),
    transition: jest.fn(
      async (params: { to: string; reason: string | null }): Promise<unknown> =>
        participation(params.to, { statusReason: params.reason }),
    ),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const realtime = { signal: jest.fn() };
  const access = new CharityProjectAccess(campaigns as never, admin as never);
  return { participations, notifier, realtime, access };
}

const decide = (deps: ReturnType<typeof make>) =>
  new DecideCharityParticipationUseCase(
    deps.access,
    deps.participations as never,
    deps.notifier as never,
    deps.realtime,
  );
const checkIn = (deps: ReturnType<typeof make>) =>
  new CheckInCharityParticipationUseCase(
    deps.access,
    deps.participations as never,
    deps.notifier as never,
    deps.realtime,
  );

describe('Quyết định với lượt tham gia', () => {
  it('xác nhận người chờ duyệt → CONFIRMED, báo participant, phát PARTICIPANTS', async () => {
    const deps = make('REGISTERED');
    const result = await decide(deps).handle({
      userId: Owner,
      campaignId: CampaignId,
      participationId: 'p1',
      action: 'CONFIRM',
      reason: null,
    });
    expect(result.status).toBe('CONFIRMED');
    expect(deps.participations.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ['REGISTERED', 'WAITLISTED', 'REJECTED'],
        to: 'CONFIRMED',
        checkIn: false,
      }),
    );
    expect(deps.notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED' }),
      'Mùa đông ấm',
    );
    expect(deps.realtime.signal).toHaveBeenCalledWith(
      CampaignId,
      ['PARTICIPANTS'],
      'workspace',
    );
  });

  it('từ chối / vắng mặt thiếu lý do → 400', async () => {
    for (const action of ['REJECT', 'NO_SHOW'] as const)
      await expect(
        decide(make('CONFIRMED')).handle({
          userId: Owner,
          campaignId: CampaignId,
          participationId: 'p1',
          action,
          reason: '  ',
        }),
      ).rejects.toThrow(ValidationFailedException);
  });

  it('sai trạng thái nguồn → 409; không có lượt → 404', async () => {
    await expect(
      decide(make('REGISTERED')).handle({
        userId: Owner,
        campaignId: CampaignId,
        participationId: 'p1',
        action: 'COMPLETE',
        reason: null,
      }),
    ).rejects.toThrow(CharityParticipationInvalidStateException);
    await expect(
      decide(make(null)).handle({
        userId: Owner,
        campaignId: CampaignId,
        participationId: 'p1',
        action: 'CONFIRM',
        reason: null,
      }),
    ).rejects.toThrow(CharityParticipationNotFoundException);
  });

  it('người khác vừa đổi trước (transition null) → 409 theo trạng thái mới nhất', async () => {
    const deps = make('REGISTERED');
    deps.participations.transition.mockResolvedValueOnce(null);
    deps.participations.find
      .mockResolvedValueOnce(participation('REGISTERED'))
      .mockResolvedValueOnce(participation('REJECTED'));
    await expect(
      decide(deps).handle({
        userId: Owner,
        campaignId: CampaignId,
        participationId: 'p1',
        action: 'CONFIRM',
        reason: null,
      }),
    ).rejects.toThrow('REJECTED');
    expect(deps.notifier.notify).not.toHaveBeenCalled();
  });
});

describe('Check-in', () => {
  it('đã xác nhận → CHECKED_IN, ghi mốc', async () => {
    const deps = make('CONFIRMED');
    const result = await checkIn(deps).handle({
      userId: Owner,
      campaignId: CampaignId,
      participationId: 'p1',
    });
    expect(result.status).toBe('CHECKED_IN');
    expect(deps.participations.transition).toHaveBeenCalledWith(
      expect.objectContaining({ from: ['CONFIRMED'], checkIn: true }),
    );
  });

  it('gọi lại khi đã check-in / đã hoàn thành → trả nguyên trạng, không ghi, không báo', async () => {
    for (const status of ['CHECKED_IN', 'COMPLETED']) {
      const deps = make(status);
      const result = await checkIn(deps).handle({
        userId: Owner,
        campaignId: CampaignId,
        participationId: 'p1',
      });
      expect(result.status).toBe(status);
      expect(deps.participations.transition).not.toHaveBeenCalled();
      expect(deps.notifier.notify).not.toHaveBeenCalled();
    }
  });

  it('chưa được xác nhận → 409', async () => {
    await expect(
      checkIn(make('REGISTERED')).handle({
        userId: Owner,
        campaignId: CampaignId,
        participationId: 'p1',
      }),
    ).rejects.toThrow(CharityParticipationInvalidStateException);
  });

  it('người không có vai vận hành → 403', async () => {
    const deps = make('CONFIRMED');
    await expect(
      checkIn({
        ...deps,
        access: new CharityProjectAccess(
          {
            findByGlobalId: jest.fn(async () => ({
              globalId: CampaignId,
              createdBy: Owner,
              approvalStatus: 'APPROVED',
            })),
            isCampaignManager: jest.fn(async () => false),
          } as never,
          {
            hasPermission: jest.fn(
              async (_user: string, permission: string) =>
                permission === 'campaign.read',
            ),
          } as never,
        ),
      }).handle({
        userId: Stranger,
        campaignId: CampaignId,
        participationId: 'p1',
      }),
    ).rejects.toThrow(CharityProjectForbiddenException);
  });
});

describe('Bước của lượt tham gia theo giai đoạn dự án', () => {
  it.each([
    // [action, trạng thái hiện tại, giai đoạn bị chặn]
    ['NO_SHOW', 'CONFIRMED', 'PLAN'],
    ['NO_SHOW', 'CONFIRMED', 'EXECUTION'],
    ['COMPLETE', 'CHECKED_IN', 'EXECUTION'],
    ['CONFIRM', 'REGISTERED', 'SUMMARY'],
    ['WAITLIST', 'REGISTERED', 'SUMMARY'],
    ['REJECT', 'REGISTERED', 'SUMMARY'],
  ] as const)(
    '%s khi dự án ở %s→%s: 409, không ghi, không báo',
    async (action, current, stage) => {
      const deps = make(current, stage);
      await expect(
        decide(deps).handle({
          userId: Owner,
          campaignId: CampaignId,
          participationId: 'p1',
          action,
          reason: 'lý do đủ dài',
        }),
      ).rejects.toThrow(CharityParticipationStageNotAllowedException);
      expect(deps.participations.transition).not.toHaveBeenCalled();
      expect(deps.notifier.notify).not.toHaveBeenCalled();
    },
  );

  it.each(['PLAN', 'EXECUTION'])(
    'check-in khi dự án mới ở %s (chưa tới Sự kiện trao) → 409',
    async (stage) => {
      const deps = make('CONFIRMED', stage);
      await expect(
        checkIn(deps).handle({
          userId: Owner,
          campaignId: CampaignId,
          participationId: 'p1',
        }),
      ).rejects.toThrow(CharityParticipationStageNotAllowedException);
      expect(deps.participations.transition).not.toHaveBeenCalled();
    },
  );

  it('check-in ở Tổng kết được (ghi bù điểm danh); duyệt người ở Kế hoạch được', async () => {
    const late = await checkIn(make('CONFIRMED', 'SUMMARY')).handle({
      userId: Owner,
      campaignId: CampaignId,
      participationId: 'p1',
    });
    expect(late.status).toBe('CHECKED_IN');
    const early = await decide(make('REGISTERED', 'PLAN')).handle({
      userId: Owner,
      campaignId: CampaignId,
      participationId: 'p1',
      action: 'CONFIRM',
      reason: null,
    });
    expect(early.status).toBe('CONFIRMED');
  });

  it('gửi lại check-in khi đã check-in vẫn trả nguyên trạng dù giai đoạn đã đổi', async () => {
    const deps = make('CHECKED_IN', 'PLAN');
    const result = await checkIn(deps).handle({
      userId: Owner,
      campaignId: CampaignId,
      participationId: 'p1',
    });
    expect(result.status).toBe('CHECKED_IN');
  });
});
