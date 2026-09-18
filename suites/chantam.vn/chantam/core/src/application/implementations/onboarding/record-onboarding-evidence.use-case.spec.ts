import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

describe('RecordOnboardingEvidenceUseCase', () => {
  const command = {
    userId: '10000000-0000-4000-8000-000000000001',
    evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
    evidenceRef: 'profile:updated',
  };

  it('records trusted evidence through the atomic completion and promotion repository operation', async () => {
    const completions = {
      recordEvidenceAndPromoteMember: jest.fn(async () => undefined),
    };
    const useCase = new RecordOnboardingEvidenceUseCase(completions as never);

    await useCase.handle(command);

    expect(completions.recordEvidenceAndPromoteMember).toHaveBeenCalledWith(
      command,
    );
  });

  it('allows repeated trusted evidence so persistence can record it idempotently', async () => {
    const completions = {
      recordEvidenceAndPromoteMember: jest.fn(async () => undefined),
    };
    const useCase = new RecordOnboardingEvidenceUseCase(completions as never);

    await useCase.handle(command);
    await useCase.handle(command);

    expect(completions.recordEvidenceAndPromoteMember).toHaveBeenCalledTimes(2);
  });
});
