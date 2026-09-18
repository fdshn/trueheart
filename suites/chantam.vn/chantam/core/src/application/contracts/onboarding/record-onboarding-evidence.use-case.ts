import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRecordOnboardingEvidenceCommand {
  userId: string;
  evidenceType: OnboardingTaskEvidenceTypes;
  evidenceRef?: string;
}

export interface IRecordOnboardingEvidenceResult {
  promoted: boolean;
}

export interface IRecordOnboardingEvidenceUseCase extends IUseCase<
  IRecordOnboardingEvidenceCommand,
  IRecordOnboardingEvidenceResult
> {}

export const IRecordOnboardingEvidenceUseCase = Symbol(
  'IRecordOnboardingEvidenceUseCase',
);
