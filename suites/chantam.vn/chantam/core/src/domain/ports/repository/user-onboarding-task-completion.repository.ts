import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IUserOnboardingTaskCompletionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IRecordOnboardingEvidenceParams {
  userId: string;
  evidenceType: OnboardingTaskEvidenceTypes;
  evidenceRef?: string;
}

export interface IUserOnboardingTaskCompletionRepository extends Repository<IUserOnboardingTaskCompletionEntity> {
  recordEvidenceAndPromoteMember(
    params: IRecordOnboardingEvidenceParams,
  ): Promise<void>;
}

export const IUserOnboardingTaskCompletionRepository = Symbol(
  'IUserOnboardingTaskCompletionRepository',
);
