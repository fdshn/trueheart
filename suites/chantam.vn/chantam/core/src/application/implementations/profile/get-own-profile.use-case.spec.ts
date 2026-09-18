import { GetOwnProfileUseCase } from './get-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const ReferrerId = '20000000-0000-4000-8000-000000000002';

describe('GetOwnProfileUseCase', () => {
  it('includes referral and referrer summary in the own profile payload', async () => {
    const userRepository = {
      findOneBy: jest.fn(async ({ globalId }) =>
        globalId === UserId
          ? {
              globalId: UserId,
              username: 'alice',
              fullName: 'Alice',
              avatarUrl: 'https://cdn.example.com/avatar.png',
              email: 'alice@example.com',
              phone: '+84912345678',
              defaultLocation: null,
              rank: 'VIEWER',
              status: 'ACTIVE',
              phoneVerifiedAt: new Date(),
              deletedAt: null,
            }
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
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM referrals') && params[0] === UserId) {
          return [{ referrer_id: ReferrerId }];
        }
        return [];
      }),
    };
    const referralRepository = {
      getOwnSummary: jest.fn(async () => ({
        code: 'AB12CD34EF',
        totalCount: 4,
        qualifiedCount: 2,
        rewardedCount: 2,
      })),
    };

    const useCase = new GetOwnProfileUseCase(
      userRepository as never,
      referralRepository as never,
    );

    await expect(useCase.handle({ userId: UserId })).resolves.toEqual({
      profile: {
        userId: UserId,
        username: 'alice',
        fullName: 'Alice',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        email: 'alice@example.com',
        phone: '+84912345678',
        defaultLocation: null,
        rank: 'VIEWER',
        status: 'ACTIVE',
        phoneVerified: true,
        profileComplete: true,
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
      },
    });
    expect(referralRepository.getOwnSummary).toHaveBeenCalledWith(UserId);
  });
});
