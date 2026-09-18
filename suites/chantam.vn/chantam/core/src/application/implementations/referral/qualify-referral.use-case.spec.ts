import { QualifyReferralUseCase } from './qualify-referral.use-case';

const RefereeId = '10000000-0000-4000-8000-000000000001';

describe('QualifyReferralUseCase', () => {
  it('qualifies the immutable referral once after Member onboarding', async () => {
    const referrals = {
      qualifyAndAward: jest.fn(async () => true),
    };
    const useCase = new QualifyReferralUseCase(referrals as never);

    await useCase.handle({ refereeId: RefereeId });

    expect(referrals.qualifyAndAward).toHaveBeenCalledWith({
      refereeId: RefereeId,
    });
  });
});
