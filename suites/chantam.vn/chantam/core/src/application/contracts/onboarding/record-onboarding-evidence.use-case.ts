import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRecordOnboardingEvidenceCommand {
  userId: string;
  evidenceType: OnboardingTaskEvidenceTypes;
  evidenceRef?: string;
}

export interface IRecordOnboardingEvidenceUseCase extends IUseCase<
  IRecordOnboardingEvidenceCommand,
  void
> {}

export const IRecordOnboardingEvidenceUseCase = Symbol(
  'IRecordOnboardingEvidenceUseCase',
);
