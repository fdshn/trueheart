import { GetOwnReferralUseCase } from './get-own-referral.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOwnReferralUseCase', () => {
  it('returns only the owner referral code and aggregate counts', async () => {
    const referrals = {
      getOwnSummary: jest.fn(async () => ({
        code: 'AB12CD34EF',
        totalCount: 4,
        qualifiedCount: 2,
        rewardedCount: 2,
      })),
    };
    const useCase = new GetOwnReferralUseCase(referrals as never);

    await expect(useCase.handle({ userId: UserId })).resolves.toEqual({
      referral: {
        code: 'AB12CD34EF',
        totalCount: 4,
        qualifiedCount: 2,
        rewardedCount: 2,
      },
    });
    expect(referrals.getOwnSummary).toHaveBeenCalledWith(UserId);
  });
});
