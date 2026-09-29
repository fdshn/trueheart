import { QualifyReferralUseCase } from './qualify-referral.use-case';

const RefereeId = '10000000-0000-4000-8000-000000000001';

describe('QualifyReferralUseCase', () => {
  it('attempts the immutable referral qualification after Member onboarding', async () => {
    const referrals = {
      qualifyAndAward: jest.fn(async () => ({ qualified: false })),
    };
    const rank = { afterBalanceChange: jest.fn() };
    const useCase = new QualifyReferralUseCase(
      referrals as never,
      rank as never,
    );

    await useCase.handle({ refereeId: RefereeId });

    expect(referrals.qualifyAndAward).toHaveBeenCalledWith({
      refereeId: RefereeId,
    });
  });

  it('reconciles the referrer only after a referral qualification commits', async () => {
    const referrerId = '20000000-0000-4000-8000-000000000002';
    const referrals = {
      qualifyAndAward: jest.fn(async () => ({ qualified: true, referrerId })),
    };
    const rank = { afterBalanceChange: jest.fn().mockResolvedValue(null) };
    const useCase = new QualifyReferralUseCase(
      referrals as never,
      rank as never,
    );

    await useCase.handle({ refereeId: RefereeId });

    // Qua notifier, không phải `reconcileNormalRank` trần: 56 điểm giới thiệu có
    // thể đẩy người ta lên hạng, và họ nên được biết.
    expect(rank.afterBalanceChange).toHaveBeenCalledWith(referrerId);
  });

  it('does not disclose or reconcile an unchanged qualification replay', async () => {
    const referrals = {
      qualifyAndAward: jest.fn(async () => ({ qualified: false })),
    };
    const rank = { afterBalanceChange: jest.fn() };
    const useCase = new QualifyReferralUseCase(
      referrals as never,
      rank as never,
    );

    await useCase.handle({ refereeId: RefereeId });

    expect(rank.afterBalanceChange).not.toHaveBeenCalled();
  });
});
