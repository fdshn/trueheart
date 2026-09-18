import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOwnRankSummaryUseCase', () => {
  it('delegates the authenticated owner ID and maps summary progress', async () => {
    const ranks = {
      getOwnSummary: jest.fn(async () => ({
        rank: UserRanks.MEMBER,
        lifetimePoints: 448,
        currentTier: {
          rank: UserRanks.MEMBER,
          thresholdPoints: 224,
          requiredGifts: 0,
          requiredReferrals: 0,
          postQuota: 3,
        },
        nextTier: {
          rank: UserRanks.SILVER,
          thresholdPoints: 672,
          requiredGifts: 1,
          requiredReferrals: 1,
          postQuota: 10,
        },
        qualifiedReferrals: 1,
        maintenanceCycle: null,
      })),
    };
    const useCase = new GetOwnRankSummaryUseCase(ranks as never);

    await expect(useCase.handle({ userId: UserId })).resolves.toEqual({
      rank: {
        rank: UserRanks.MEMBER,
        lifetimePoints: 448,
        postQuota: 3,
        nextRank: {
          rank: UserRanks.SILVER,
          requiredPoints: 672,
          remainingPoints: 224,
          requiredGifts: 1,
          requiredReferrals: 1,
          qualifiedReferrals: 1,
        },
        maintenanceCycle: null,
      },
    });
    expect(ranks.getOwnSummary).toHaveBeenCalledWith(UserId);
  });

  it('keeps next rank null at Diamond', async () => {
    const ranks = {
      getOwnSummary: jest.fn(async () => ({
        rank: UserRanks.DIAMOND,
        lifetimePoints: 1792,
        currentTier: {
          rank: UserRanks.DIAMOND,
          thresholdPoints: 1792,
          requiredGifts: 0,
          requiredReferrals: 0,
          postQuota: 50,
        },
        nextTier: null,
        qualifiedReferrals: 4,
        maintenanceCycle: null,
      })),
    };
    const useCase = new GetOwnRankSummaryUseCase(ranks as never);

    await expect(useCase.handle({ userId: UserId })).resolves.toMatchObject({
      rank: { nextRank: null },
    });
  });
});
