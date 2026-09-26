import { GetOwnProfileUseCase } from './get-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const ReferrerId = '20000000-0000-4000-8000-000000000002';

const PointSummary = { balance: 84, lifetime: 252 };
const RankSummary = {
  rank: 'MEMBER',
  lifetimePoints: 252,
  postQuota: 3,
  nextRank: {
    rank: 'SILVER',
    requiredPoints: 672,
    remainingPoints: 420,
    requiredGifts: 1,
    requiredReferrals: 1,
    qualifiedReferrals: 2,
  },
  maintenanceCycle: null,
};
const Entitlements = {
  rank: 'MEMBER',
  policyRevisionId: 7,
  capabilities: [
    {
      code: 'POST_OPEN',
      allowed: true,
      limit: 3,
      used: 1,
      remaining: 2,
      reasonCode: null,
    },
  ],
};

function makeDeps(user: unknown) {
  return {
    userRepository: {
      findOneBy: jest.fn(async ({ globalId }: { globalId: string }) =>
        globalId === UserId
          ? user
          : globalId === ReferrerId
            ? {
                globalId: ReferrerId,
                username: 'bob',
                fullName: 'Bob',
                avatarUrl: 'https://cdn.example.com/bob.png',
                deletedAt: null,
              }
            : null,
      ),
      query: jest.fn(async (sql: string, params: unknown[]) =>
        sql.includes('FROM referrals') && params[0] === UserId
          ? [{ referrer_id: ReferrerId }]
          : [],
      ),
    },
    referralRepository: {
      getOwnSummary: jest.fn(async () => ({
        code: 'AB12CD34EF',
        totalCount: 4,
        qualifiedCount: 2,
        rewardedCount: 2,
      })),
    },
    pointUseCase: { handle: jest.fn(async () => ({ point: PointSummary })) },
    rankUseCase: { handle: jest.fn(async () => ({ rank: RankSummary })) },
    entitlementUseCase: {
      handle: jest.fn(async () => ({ entitlements: Entitlements })),
    },
    reviewRepository: {
      getAccuracy: jest.fn(async () => ({
        percent: 92,
        samples: 7,
        reviewRequired: false,
      })),
    },
    adminConfig: {
      getConfigValue: jest.fn(async () => ({
        minSamples: 5,
        reviewThresholdPercent: 75,
      })),
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new GetOwnProfileUseCase(
    deps.userRepository as never,
    deps.referralRepository as never,
    deps.pointUseCase as never,
    deps.rankUseCase as never,
    deps.entitlementUseCase as never,
    deps.reviewRepository as never,
    deps.adminConfig as never,
  );
}

const ActiveUser = {
  globalId: UserId,
  username: 'alice',
  fullName: 'Alice',
  avatarUrl: 'https://cdn.example.com/avatar.png',
  email: 'alice@example.com',
  phone: '+84912345678',
  defaultLocation: null,
  rank: 'MEMBER',
  status: 'ACTIVE',
  phoneVerifiedAt: new Date(),
  deletedAt: null,
};

describe('GetOwnProfileUseCase', () => {
  it('composes referral, point, rank progress and entitlements for the owner', async () => {
    const deps = makeDeps(ActiveUser);

    await expect(makeUseCase(deps).handle({ userId: UserId })).resolves.toEqual(
      {
        profile: {
          userId: UserId,
          username: 'alice',
          fullName: 'Alice',
          avatarUrl: 'https://cdn.example.com/avatar.png',
          email: 'alice@example.com',
          phone: '+84912345678',
          defaultLocation: null,
          rank: 'MEMBER',
          status: 'ACTIVE',
          phoneVerified: true,
          emailVerified: false,
          profileComplete: true,
          accuracy: { percent: 92, samples: 7, minSamples: 5 },
          referral: {
            code: 'AB12CD34EF',
            totalCount: 4,
            qualifiedCount: 2,
            rewardedCount: 2,
          },
          referrer: {
            userId: ReferrerId,
            username: 'bob',
            fullName: 'Bob',
            avatarUrl: 'https://cdn.example.com/bob.png',
          },
          point: PointSummary,
          rankProgress: RankSummary,
          entitlements: Entitlements,
        },
      },
    );

    // Chính chủ mới được xem, nên mọi use case con đều phải nhận đúng userId
    // đã xác thực chứ không phải một ID lấy từ input.
    for (const child of [
      deps.pointUseCase,
      deps.rankUseCase,
      deps.entitlementUseCase,
    ])
      expect(child.handle).toHaveBeenCalledWith({ userId: UserId });
  });

  it('không gọi use case con khi tài khoản đã bị xoá', async () => {
    const deps = makeDeps({ ...ActiveUser, deletedAt: new Date() });

    await expect(
      makeUseCase(deps).handle({ userId: UserId }),
    ).rejects.toThrow();

    for (const child of [
      deps.pointUseCase,
      deps.rankUseCase,
      deps.entitlementUseCase,
    ])
      expect(child.handle).not.toHaveBeenCalled();
  });

  it('không gọi use case con khi không tìm thấy tài khoản', async () => {
    const deps = makeDeps(null);

    await expect(
      makeUseCase(deps).handle({ userId: UserId }),
    ).rejects.toThrow();

    expect(deps.referralRepository.getOwnSummary).not.toHaveBeenCalled();
    for (const child of [
      deps.pointUseCase,
      deps.rankUseCase,
      deps.entitlementUseCase,
    ])
      expect(child.handle).not.toHaveBeenCalled();
  });
});
