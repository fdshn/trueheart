import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOwnRankSummaryUseCase', () => {
  it('delegates the authenticated owner ID and maps summary progress', async () => {
    const ranks = {
      getOwnSummary: jest.fn(async () => ({
        rank: UserRanks.MEMBER,
        lifetimePoints: 448,
        // Đã tiêu 48: lên hạng xét theo 400, không theo 448.
        balancePoints: 400,
        rankPoints: 400,
        rankPointsSource: 'BALANCE',
        currentTier: {
          rank: UserRanks.MEMBER,
          thresholdPoints: 224,
          warningPoints: 157,
          requiredGifts: 0,
          requiredReferrals: 0,
          postQuota: 3,
        },
        nextTier: {
          rank: UserRanks.SILVER,
          thresholdPoints: 672,
          warningPoints: 470,
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
        balancePoints: 400,
        rankPoints: 400,
        rankPointsSource: 'BALANCE',
        thresholdPoints: 224,
        warningPoints: 157,
        demotionWarning: false,
        postQuota: 3,
        nextRank: {
          rank: UserRanks.SILVER,
          requiredPoints: 672,
          // 672 − 400 (balance), KHÔNG phải 672 − 448 (lifetime).
          remainingPoints: 272,
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
        balancePoints: 1792,
        rankPoints: 1792,
        rankPointsSource: 'BALANCE',
        currentTier: {
          rank: UserRanks.DIAMOND,
          thresholdPoints: 1792,
          warningPoints: 1254,
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

  it('gắn cờ cảnh báo khi điểm xuống dưới mốc', async () => {
    // Hạng do balance quyết, nên người dùng phải được nhắc TRƯỚC khi tiêu thêm
    // và mất hạng mà không hiểu vì sao.
    const ranks = {
      getOwnSummary: jest.fn(async () => ({
        rank: UserRanks.SILVER,
        lifetimePoints: 1200,
        balancePoints: 460,
        rankPoints: 460,
        rankPointsSource: 'BALANCE',
        currentTier: {
          rank: UserRanks.SILVER,
          thresholdPoints: 672,
          warningPoints: 470,
          requiredGifts: 1,
          requiredReferrals: 1,
          postQuota: 10,
        },
        nextTier: null,
        qualifiedReferrals: 2,
        maintenanceCycle: null,
      })),
    };

    await expect(
      new GetOwnRankSummaryUseCase(ranks as never).handle({ userId: UserId }),
    ).resolves.toMatchObject({ rank: { demotionWarning: true } });
  });

  it('bậc không có mốc cảnh báo thì không bao giờ gắn cờ', async () => {
    // Viewer có `warning_points = 0`; so sánh trần sẽ luôn ra false, nhưng để
    // rõ ý nên chặn tường minh.
    const ranks = {
      getOwnSummary: jest.fn(async () => ({
        rank: UserRanks.VIEWER,
        lifetimePoints: 0,
        balancePoints: 0,
        rankPoints: 0,
        rankPointsSource: 'BALANCE',
        currentTier: {
          rank: UserRanks.VIEWER,
          thresholdPoints: 0,
          warningPoints: 0,
          requiredGifts: 0,
          requiredReferrals: 0,
          postQuota: 0,
        },
        nextTier: null,
        qualifiedReferrals: 0,
        maintenanceCycle: null,
      })),
    };

    await expect(
      new GetOwnRankSummaryUseCase(ranks as never).handle({ userId: UserId }),
    ).resolves.toMatchObject({ rank: { demotionWarning: false } });
  });
});
