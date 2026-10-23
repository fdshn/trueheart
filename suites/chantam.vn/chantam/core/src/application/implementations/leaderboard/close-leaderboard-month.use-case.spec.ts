import { ILeaderboardRow } from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  LeaderboardConfigKeys,
  NotificationTargetTypes,
  NotificationTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { CloseLeaderboardMonthUseCase } from './close-leaderboard-month.use-case';

const Winner = '11111111-1111-4111-8111-111111111111';

const row = (rank: number, userId: string): ILeaderboardRow => ({
  rank,
  count: 5 - rank,
  reachedAt: new Date('2026-10-10T00:00:00Z'),
  userId,
  isAnonymous: false,
  isInactive: false,
  identity: {
    username: 'u',
    fullName: null,
    avatarUrl: null,
    rank: UserRanks.MEMBER,
  },
});

function make(
  options: {
    config?: Record<string, unknown>;
    created?: boolean;
    dispatch?: jest.Mock;
  } = {},
) {
  const repository = {
    computeLive: jest.fn(async () => [row(1, Winner)]),
    // Đúng hợp đồng của repository: không trao (`awardBadges: null`) hoặc đã chốt từ trước
    // thì không có huy hiệu mới nào.
    closeBoard: jest.fn(async (params: { awardBadges: unknown }) => ({
      created: options.created ?? true,
      badges:
        options.created === false || params.awardBadges === null
          ? []
          : [{ userId: Winner, rank: 1 }],
    })),
  };
  const adminConfig = {
    getConfigValue: jest.fn(
      async (key: string) => options.config?.[key] ?? null,
    ),
  };
  const dispatch = {
    handle: options.dispatch ?? jest.fn(async () => ({ created: true })),
  };
  const useCase = new CloseLeaderboardMonthUseCase(
    repository as never,
    adminConfig as never,
    dispatch as never,
  );
  return { useCase, repository, dispatch };
}

// 00:05 ngày 1/11 giờ Việt Nam.
const firstOfNovember = new Date('2026-10-31T17:05:00Z');

describe('CloseLeaderboardMonthUseCase', () => {
  it('mặc định chốt THÁNG TRƯỚC theo giờ Việt Nam, cả ba bảng', async () => {
    const { useCase, repository } = make();

    const result = await useCase.handle({ now: firstOfNovember });

    expect(result.month).toBe('2026-10');
    expect(result.boards.map((board) => board.board)).toEqual([
      LeaderboardBoards.GIVERS,
      LeaderboardBoards.CHARITY,
      LeaderboardBoards.CONSISTENCY,
    ]);
    expect(repository.computeLive).toHaveBeenCalledWith({
      month: '2026-10-01',
      board: LeaderboardBoards.CONSISTENCY,
      minCount: 10,
      revealIdentity: true,
    });
  });

  it('huy hiệu tháng 10 với hạn 3 tháng hết lúc 00:00 ngày 1/2 giờ VN', async () => {
    const { useCase, repository } = make();

    await useCase.handle({ now: firstOfNovember });

    expect(repository.closeBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        month: '2026-10-01',
        awardBadges: {
          ranks: 3,
          expiresAt: new Date('2027-01-31T17:00:00Z'),
        },
      }),
    );
  });

  it.each([
    ['tháng hiện tại', '2026-11'],
    ['tháng tương lai', '2027-01'],
  ])('từ chối chốt %s', async (_label, month) => {
    const { useCase, repository } = make();

    await expect(
      useCase.handle({ month, now: firstOfNovember }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.closeBoard).not.toHaveBeenCalled();
  });

  it('tính năng tắt: VẪN chốt sổ nhưng không trao huy hiệu, không thông báo', async () => {
    const { useCase, repository, dispatch } = make({
      config: { [LeaderboardConfigKeys.ENABLED]: 0 },
    });

    await useCase.handle({ now: firstOfNovember });

    expect(repository.closeBoard).toHaveBeenCalledTimes(3);
    for (const [call] of repository.closeBoard.mock.calls as unknown as [
      { awardBadges: unknown },
    ][])
      expect(call.awardBadges).toBeNull();
    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('chốt bù một tháng mà huy hiệu đã quá hạn: ghi bản chốt, không huy hiệu, không thông báo', async () => {
    const { useCase, repository, dispatch } = make();

    await useCase.handle({
      month: '2026-06',
      now: firstOfNovember,
    });

    expect(repository.closeBoard).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-06-01', awardBadges: null }),
    );
    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('báo người nhận huy hiệu, đích bảng của tôi, khoá chống trùng theo bảng-tháng-người', async () => {
    const { useCase, dispatch } = make();

    await useCase.handle({ now: firstOfNovember });

    expect(dispatch.handle).toHaveBeenCalledWith({
      userId: Winner,
      type: NotificationTypes.LEADERBOARD_BADGE_AWARDED,
      title: 'Bạn lọt top bảng thành tích tháng',
      body: 'Bạn đứng thứ 1 bảng Người cho tháng 10/2026.',
      target: { type: NotificationTargetTypes.LEADERBOARD, id: null },
      idempotencyKey: `LEADERBOARD_BADGE:GIVERS:2026-10:${Winner}`,
    });
  });

  it('đã chốt từ trước thì không gửi gì', async () => {
    const { useCase, dispatch } = make({ created: false });

    const result = await useCase.handle({ now: firstOfNovember });

    expect(result.boards.every((board) => !board.created)).toBe(true);
    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('gửi thông báo hỏng thì lượt chốt vẫn thành công', async () => {
    const { useCase } = make({
      dispatch: jest.fn(async () => {
        throw new Error('push down');
      }),
    });

    await expect(useCase.handle({ now: firstOfNovember })).resolves.toEqual(
      expect.objectContaining({ month: '2026-10' }),
    );
  });
});
