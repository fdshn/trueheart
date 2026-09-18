import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

const Command = {
  userId: '10000000-0000-4000-8000-000000000001',
  evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
  evidenceRef: 'profile:updated',
};

describe('RecordOnboardingEvidenceUseCase', () => {
  it('returns promotion when trusted evidence completes onboarding', async () => {
    const completions = {
      recordEvidenceAndPromoteMember: jest.fn(async () => ({ promoted: true })),
    };
    const useCase = new RecordOnboardingEvidenceUseCase(completions as never);

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: true });
    expect(completions.recordEvidenceAndPromoteMember).toHaveBeenCalledWith(
      Command,
    );
  });

  it('returns no promotion on idempotent evidence replay', async () => {
    const completions = {
      recordEvidenceAndPromoteMember: jest.fn(async () => ({
        promoted: false,
      })),
    };
    const useCase = new RecordOnboardingEvidenceUseCase(completions as never);

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: false });
  });
});
