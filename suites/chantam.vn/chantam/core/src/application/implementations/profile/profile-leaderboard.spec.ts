import { IUserBadge } from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ListOwnBadgesUseCase } from '../leaderboard/list-own-badges.use-case';
import { GetOwnProfileUseCase } from './get-own-profile.use-case';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

const user = {
  globalId: UserId,
  username: 'nguoi-demo',
  fullName: 'Người Demo',
  avatarUrl: null,
  email: null,
  phone: null,
  defaultLocation: null,
  rank: UserRanks.MEMBER,
  status: 'ACTIVE',
  phoneVerifiedAt: null,
  emailVerifiedAt: null,
  deletedAt: null,
  leaderboardAnonymous: true,
};

const badge = (overrides: Partial<IUserBadge> = {}): IUserBadge => ({
  badgeId: 'b-1',
  userId: UserId,
  board: LeaderboardBoards.CONSISTENCY,
  month: '2026-10-01',
  rank: 2,
  isAnonymous: false,
  awardedAt: new Date('2026-10-31T17:05:00Z'),
  expiresAt: new Date('2027-01-31T17:00:00Z'),
  revokedAt: null,
  revokeReason: null,
  ...overrides,
});

const leaderboard = (badges: IUserBadge[] = [badge()]) => ({
  listBadges: jest.fn(async () => badges),
});

const reviews = {
  getAccuracy: async () => ({
    percent: null,
    samples: 0,
    reviewRequired: false,
  }),
  getRating: async () => ({
    asGiver: { average: null, samples: 0 },
    asReceiver: { average: null, samples: 0 },
  }),
};

describe('huy hiệu trên hồ sơ công khai', () => {
  it('chỉ lấy huy hiệu CÔNG KHAI còn hạn, trả nhãn tháng YYYY-MM', async () => {
    const badges = leaderboard();
    const useCase = new GetPublicProfileUseCase(
      { findActiveByUsername: jest.fn(async () => user) } as never,
      { countPublishedByAuthor: jest.fn(async () => 0) } as never,
      {
        getSummary: jest.fn(async () => ({ balance: 0, lifetime: 0 })),
      } as never,
      { web: { publicBaseUrl: '' } } as never,
      reviews as never,
      { getConfigValue: async () => null } as never,
      badges as never,
    );

    const result = await useCase.handle({ username: 'nguoi-demo' });

    expect(badges.listBadges).toHaveBeenCalledWith(
      expect.objectContaining({ userId: UserId, scope: 'PUBLIC_ACTIVE' }),
    );
    expect(result.profile.badges).toEqual([
      {
        badgeId: 'b-1',
        board: LeaderboardBoards.CONSISTENCY,
        month: '2026-10',
        rank: 2,
        expiresAt: new Date('2027-01-31T17:00:00Z'),
        isAnonymous: false,
        status: 'ACTIVE',
      },
    ]);
    // Hồ sơ công khai không nói người này có đang ẩn danh trên bảng hay không.
    expect(JSON.stringify(result)).not.toContain('leaderboardAnonymous');
  });
});

describe('hồ sơ của tôi', () => {
  const make = (badges = leaderboard()) =>
    new GetOwnProfileUseCase(
      {
        findOneBy: jest.fn(async () => user),
        query: jest.fn(async () => []),
      } as never,
      { getOwnSummary: jest.fn(async () => null) } as never,
      { handle: jest.fn(async () => ({ point: null })) } as never,
      { handle: jest.fn(async () => ({ rank: null })) } as never,
      {
        handle: jest.fn(async () => ({
          entitlements: null,
          groupCreation: null,
        })),
      } as never,
      reviews as never,
      { getConfigValue: async () => null } as never,
      badges as never,
    );

  it('có huy hiệu còn hạn của chính mình (kể cả huy hiệu ẩn danh) và cờ ẩn danh', async () => {
    const badges = leaderboard([badge({ isAnonymous: true })]);

    const result = await make(badges).handle({ userId: UserId });

    expect(badges.listBadges).toHaveBeenCalledWith(
      expect.objectContaining({ userId: UserId, scope: 'OWN_ACTIVE' }),
    );
    expect(result.profile.leaderboardAnonymous).toBe(true);
    expect(result.profile.badges?.[0].isAnonymous).toBe(true);
  });
});

describe('cập nhật cờ ẩn danh', () => {
  const make = () => {
    const users = {
      findOneBy: jest.fn(async () => user),
      update: jest.fn(async () => undefined),
      findOneByOrFail: jest.fn(async () => user),
    };
    const useCase = new UpdateOwnProfileUseCase(
      users as never,
      {} as never,
      { handle: jest.fn() } as never,
    );
    return { users, useCase };
  };

  it('gửi leaderboardAnonymous thì ghi đúng giá trị', async () => {
    const { users, useCase } = make();

    await useCase.handle({
      userId: UserId,
      profile: { leaderboardAnonymous: false },
    });

    expect(users.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { leaderboardAnonymous: false },
    );
  });

  it('không gửi thì không đụng tới', async () => {
    const { users, useCase } = make();

    await useCase.handle({ userId: UserId, profile: { fullName: 'Tên Mới' } });

    expect(users.update).toHaveBeenCalledWith(
      { globalId: UserId },
      expect.not.objectContaining({ leaderboardAnonymous: expect.anything() }),
    );
  });
});

describe('ListOwnBadgesUseCase', () => {
  it('trả MỌI huy hiệu với trạng thái còn hạn / hết hạn / đã gỡ', async () => {
    const now = new Date('2027-03-01T00:00:00Z');
    const badges = leaderboard([
      badge({ badgeId: 'active', expiresAt: new Date('2027-04-30T17:00:00Z') }),
      badge({ badgeId: 'expired' }),
      badge({
        badgeId: 'revoked',
        expiresAt: new Date('2027-04-30T17:00:00Z'),
        revokedAt: new Date('2027-02-01T00:00:00Z'),
        revokeReason: 'Gian lận',
      }),
    ]);

    const result = await new ListOwnBadgesUseCase(
      badges as never,
      () => now,
    ).handle({ userId: UserId });

    expect(badges.listBadges).toHaveBeenCalledWith({
      userId: UserId,
      scope: 'ALL',
      now,
    });
    expect(
      result.badges.map((item) => `${item.badgeId}:${item.status}`),
    ).toEqual(['active:ACTIVE', 'expired:EXPIRED', 'revoked:REVOKED']);
  });
});
