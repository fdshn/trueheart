import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IUserOnboardingTaskCompletionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IRecordOnboardingEvidenceParams {
  userId: string;
  evidenceType: OnboardingTaskEvidenceTypes;
  evidenceRef?: string;
}

export interface IRecordOnboardingEvidenceResult {
  onboardingComplete: boolean;
}

export interface IUserOnboardingTaskCompletionRepository extends Repository<IUserOnboardingTaskCompletionEntity> {
  recordEvidenceAndDetermineCompletion(
    params: IRecordOnboardingEvidenceParams,
  ): Promise<IRecordOnboardingEvidenceResult>;
  hasCompletedEvidence(
    userId: string,
    evidenceType: OnboardingTaskEvidenceTypes,
  ): Promise<boolean>;
}

export const IUserOnboardingTaskCompletionRepository = Symbol(
  'IUserOnboardingTaskCompletionRepository',
);
