import { ILeaderboardRow } from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  LeaderboardConfigKeys,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { readLeaderboardConfig } from './leaderboard-config';
import {
  GetMonthlyLeaderboardUseCase,
  GetMyLeaderboardPositionsUseCase,
  ListLeaderboardMonthsUseCase,
} from './leaderboard.use-cases';

const Me = '11111111-1111-4111-8111-111111111111';
const Hidden = '22222222-2222-4222-8222-222222222222';

function row(
  rank: number,
  count: number,
  userId: string,
  overrides: Partial<ILeaderboardRow> = {},
): ILeaderboardRow {
  return {
    rank,
    count,
    reachedAt: new Date('2026-10-10T00:00:00Z'),
    userId,
    isAnonymous: false,
    isInactive: false,
    identity: {
      username: `u${rank}`,
      fullName: `Tên ${rank}`,
      avatarUrl: null,
      rank: UserRanks.MEMBER,
    },
    ...overrides,
  };
}

function makeRepository(overrides: Record<string, unknown> = {}) {
  return {
    findSnapshot: jest.fn(async () => null),
    computeLive: jest.fn(async () => [] as ILeaderboardRow[]),
    listSnapshotEntries: jest.fn(async () => ({ items: [], total: 0 })),
    findSnapshotEntry: jest.fn(async () => null),
    listClosedMonths: jest.fn(async () => []),
    findLiveIdentities: jest.fn(async () => new Map()),
    ...overrides,
  };
}

function makeConfig(values: Record<string, unknown> = {}) {
  return {
    getConfigValue: jest.fn(async (key: string) => values[key] ?? null),
  };
}

const now = () => new Date('2026-10-24T05:00:00Z');

describe('readLeaderboardConfig', () => {
  it('thiếu cấu hình thì dùng mặc định 1/1/10/3/3 và đang bật', async () => {
    expect(await readLeaderboardConfig(makeConfig() as never)).toEqual({
      enabled: true,
      minCount: {
        [LeaderboardBoards.GIVERS]: 1,
        [LeaderboardBoards.CHARITY]: 1,
        [LeaderboardBoards.CONSISTENCY]: 10,
      },
      badgeRanks: 3,
      badgeMonths: 3,
    });
  });

  it('giá trị sai kiểu thì về mặc định, 0 ở công tắc là tắt', async () => {
    const config = await readLeaderboardConfig(
      makeConfig({
        [LeaderboardConfigKeys.ENABLED]: 0,
        [LeaderboardConfigKeys.MIN_CONSISTENCY_DAYS]: 'mười',
        [LeaderboardConfigKeys.BADGE_RANKS]: 5,
      }) as never,
    );
    expect(config.enabled).toBe(false);
    expect(config.minCount[LeaderboardBoards.CONSISTENCY]).toBe(10);
    expect(config.badgeRanks).toBe(5);
  });
});

describe('GetMonthlyLeaderboardUseCase', () => {
  const make = (repository = makeRepository(), config = makeConfig()) =>
    new GetMonthlyLeaderboardUseCase(repository as never, config as never, now);

  it('tháng đã chốt đọc bản chốt, không tính lại', async () => {
    const repository = makeRepository({
      findSnapshot: jest.fn(async () => ({
        id: '7',
        closedAt: new Date('2026-10-01T00:05:00Z'),
        badgesAwarded: true,
      })),
      listSnapshotEntries: jest.fn(async () => ({
        items: [row(1, 4, Me)],
        total: 1,
      })),
    });

    const result = await make(repository).handle({
      viewerId: null,
      board: LeaderboardBoards.GIVERS,
      month: '2026-09',
    });

    expect(result.status).toBe('CLOSED');
    expect(result.month).toBe('2026-09');
    expect(result.entries).toHaveLength(1);
    expect(repository.computeLive).not.toHaveBeenCalled();
    expect(repository.listSnapshotEntries).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotId: '7', skip: 0, take: 20 }),
    );
  });

  it('tháng chưa chốt tính trực tiếp với sàn của bảng, mặc định là tháng hiện tại', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () => [row(1, 12, Me)]),
    });

    const result = await make(repository).handle({
      viewerId: null,
      board: LeaderboardBoards.CONSISTENCY,
    });

    expect(result.status).toBe('LIVE');
    expect(result.month).toBe('2026-10');
    expect(result.closedAt).toBeNull();
    expect(repository.computeLive).toHaveBeenCalledWith({
      month: '2026-10-01',
      board: LeaderboardBoards.CONSISTENCY,
      minCount: 10,
    });
  });

  it('tắt tính năng thì trả rỗng và không đụng tới repository', async () => {
    const repository = makeRepository();
    const result = await make(
      repository,
      makeConfig({ [LeaderboardConfigKeys.ENABLED]: 0 }),
    ).handle({ viewerId: Me, board: LeaderboardBoards.GIVERS });

    expect(result.enabled).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.me).toBeNull();
    expect(repository.findSnapshot).not.toHaveBeenCalled();
    expect(repository.computeLive).not.toHaveBeenCalled();
  });

  it('dòng ẩn danh không mang userId hay danh tính ra response', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () => [
        row(1, 3, Hidden, { isAnonymous: true, identity: null }),
      ]),
    });

    const result = await make(repository).handle({
      viewerId: null,
      board: LeaderboardBoards.GIVERS,
    });

    expect(JSON.stringify(result)).not.toContain(Hidden);
    expect(result.entries[0]).toEqual({
      rank: 1,
      count: 3,
      isAnonymous: true,
      isInactive: false,
      user: null,
    });
  });

  it('`me` của chính người ẩn danh có danh tính của họ', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () => [
        row(1, 3, Me, { isAnonymous: true, identity: null }),
      ]),
      findSnapshotEntry: jest.fn(),
    });
    const users = {
      findOneBy: jest.fn(async () => ({
        username: 'toi',
        fullName: 'Tôi',
        avatarUrl: null,
        rank: UserRanks.MEMBER,
      })),
    };

    const result = await new GetMonthlyLeaderboardUseCase(
      repository as never,
      makeConfig() as never,
      now,
      users as never,
    ).handle({ viewerId: Me, board: LeaderboardBoards.GIVERS });

    expect(result.me).toEqual(
      expect.objectContaining({
        rank: 1,
        isAnonymous: true,
        user: expect.objectContaining({ username: 'toi' }),
      }),
    );
    expect(result.entries[0].user).toBeNull();
  });

  it('phân trang bảng trực tiếp trong bộ nhớ', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () =>
        Array.from({ length: 25 }, (_, index) =>
          row(index + 1, 30 - index, `u-${index}`),
        ),
      ),
    });

    const result = await make(repository).handle({
      viewerId: null,
      board: LeaderboardBoards.GIVERS,
      page: 2,
      pageSize: 20,
    });

    expect(result.entries.map((entry) => entry.rank)).toEqual([
      21, 22, 23, 24, 25,
    ]);
    expect(result.meta.total).toBe(25);
  });

  it.each(['abc', '2026-13', '2026-1'])(
    'tháng %p sai dạng thì 400',
    async (month) => {
      await expect(
        make().handle({
          viewerId: null,
          board: LeaderboardBoards.GIVERS,
          month,
        }),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    },
  );
});

describe('GetMyLeaderboardPositionsUseCase', () => {
  it('khoảng cách tới hạng cuối nhận huy hiệu và tới người ngay trên', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () => [
        row(1, 9, 'a'),
        row(2, 7, 'b'),
        row(3, 5, 'c'),
        row(4, 4, 'd'),
        row(5, 3, Me),
      ]),
    });

    const result = await new GetMyLeaderboardPositionsUseCase(
      repository as never,
      makeConfig() as never,
      now,
    ).handle({ userId: Me });

    const givers = result.positions.find(
      (position) => position.board === LeaderboardBoards.GIVERS,
    );
    expect(givers).toEqual({
      board: LeaderboardBoards.GIVERS,
      rank: 5,
      count: 3,
      minCount: 1,
      badgeRanks: 3,
      gapToBadge: 2,
      gapToNext: 1,
    });
    expect(result.positions.map((position) => position.board)).toEqual([
      LeaderboardBoards.GIVERS,
      LeaderboardBoards.CHARITY,
      LeaderboardBoards.CONSISTENCY,
    ]);
  });

  it('chưa đủ sàn thì không có hạng và không có khoảng cách', async () => {
    const result = await new GetMyLeaderboardPositionsUseCase(
      makeRepository() as never,
      makeConfig() as never,
      now,
    ).handle({ userId: Me });

    expect(result.positions[0]).toEqual(
      expect.objectContaining({
        rank: null,
        count: 0,
        gapToBadge: null,
        gapToNext: null,
      }),
    );
  });

  it('đang nằm trong nhóm huy hiệu thì gapToBadge null; hạng 1 thì gapToNext null', async () => {
    const repository = makeRepository({
      computeLive: jest.fn(async () => [row(1, 9, Me), row(2, 7, 'b')]),
    });

    const result = await new GetMyLeaderboardPositionsUseCase(
      repository as never,
      makeConfig() as never,
      now,
    ).handle({ userId: Me });

    expect(result.positions[0]).toEqual(
      expect.objectContaining({ rank: 1, gapToBadge: null, gapToNext: null }),
    );
  });
});

describe('ListLeaderboardMonthsUseCase', () => {
  it('trả nhãn YYYY-MM', async () => {
    const repository = makeRepository({
      listClosedMonths: jest.fn(async () => ['2026-10-01', '2026-09-01']),
    });

    expect(
      await new ListLeaderboardMonthsUseCase(repository as never).handle({}),
    ).toEqual({ months: ['2026-10', '2026-09'] });
  });
});

describe('tháng tương lai', () => {
  // Mỗi `?month=` mới là một khoá cache mới — tháng tương lai không thể có dữ liệu, nên đếm
  // nó là để một người gọi không cần đăng nhập ép database quét lại ba bảng tuỳ ý.
  it('bảng: trả rỗng LIVE, không hỏi database', async () => {
    const repository = makeRepository();

    const result = await new GetMonthlyLeaderboardUseCase(
      repository as never,
      makeConfig() as never,
      now,
    ).handle({
      viewerId: Me,
      board: LeaderboardBoards.GIVERS,
      month: '2027-05',
    });

    expect(result).toEqual(
      expect.objectContaining({
        month: '2027-05',
        status: 'LIVE',
        entries: [],
        me: null,
      }),
    );
    expect(repository.findSnapshot).not.toHaveBeenCalled();
    expect(repository.computeLive).not.toHaveBeenCalled();
  });

  it('vị trí của tôi: không hạng ở cả ba bảng, không hỏi database', async () => {
    const repository = makeRepository();

    const result = await new GetMyLeaderboardPositionsUseCase(
      repository as never,
      makeConfig() as never,
      now,
    ).handle({ userId: Me, month: '2027-05' });

    expect(result.positions.every((position) => position.rank === null)).toBe(
      true,
    );
    expect(repository.computeLive).not.toHaveBeenCalled();
  });
});

describe('ẩn danh có hiệu lực NGAY, kể cả khi bảng đang trong cache', () => {
  // Cache chỉ giữ THỨ HẠNG. Danh tính đọc mới cho đúng trang đang trả: người vừa bật "ẩn tên
  // tôi" mà còn thấy tên mình trên bảng thêm một phút là cài đặt riêng tư không làm việc.
  it('trang trả về dùng cờ ẩn danh HIỆN TẠI, không phải lúc tính bảng', async () => {
    let anonymousNow = false;
    const repository = makeRepository({
      computeLive: jest.fn(async () => [row(1, 3, Hidden)]),
      findLiveIdentities: jest.fn(
        async (userIds: string[]) =>
          new Map(
            userIds.map((userId) => [
              userId,
              anonymousNow
                ? { isAnonymous: true, identity: null }
                : {
                    isAnonymous: false,
                    identity: {
                      username: 'hien',
                      fullName: null,
                      avatarUrl: null,
                      rank: UserRanks.MEMBER,
                    },
                  },
            ]),
          ),
      ),
    });
    const useCase = new GetMonthlyLeaderboardUseCase(
      repository as never,
      makeConfig() as never,
      now,
    );
    const read = () =>
      useCase.handle({ viewerId: null, board: LeaderboardBoards.GIVERS });

    expect((await read()).entries[0].user?.username).toBe('hien');
    anonymousNow = true;
    const after = await read();

    expect(repository.computeLive).toHaveBeenCalledTimes(1);
    expect(after.entries[0]).toEqual(
      expect.objectContaining({ isAnonymous: true, user: null }),
    );
  });
});
