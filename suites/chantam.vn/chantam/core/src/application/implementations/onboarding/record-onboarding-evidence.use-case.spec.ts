import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

const Command = {
  userId: '10000000-0000-4000-8000-000000000001',
  evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
  evidenceRef: 'profile:updated',
};

describe('RecordOnboardingEvidenceUseCase', () => {
  it('does not promote or qualify referrals when evidence leaves onboarding incomplete', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: false,
      })),
    };
    const ranks = { handle: jest.fn() };
    const referrals = { handle: jest.fn() };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: false });
    expect(
      completions.recordEvidenceAndDetermineCompletion,
    ).toHaveBeenCalledWith(Command);
    expect(ranks.handle).not.toHaveBeenCalled();
    expect(referrals.handle).not.toHaveBeenCalled();
  });

  it('promotes and qualifies referral when evidence completes onboarding', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const ranks = { handle: jest.fn(async () => true) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: true });
    expect(ranks.handle).toHaveBeenCalledWith({
      userId: Command.userId,
    });
    expect(referrals.handle).toHaveBeenCalledWith({
      refereeId: Command.userId,
    });
  });

  it('retries idempotent referral qualification for complete-onboarding evidence replay', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const ranks = { handle: jest.fn(async () => false) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: false });
    expect(referrals.handle).toHaveBeenCalledWith({
      refereeId: Command.userId,
    });
  });
});
