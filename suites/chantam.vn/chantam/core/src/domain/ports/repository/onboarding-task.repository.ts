import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IOnboardingTaskEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IOnboardingTaskRepository extends Repository<IOnboardingTaskEntity> {
  findActiveByEvidenceType(
    evidenceType: OnboardingTaskEvidenceTypes,
  ): Promise<IOnboardingTaskEntity | null>;
}

export const IOnboardingTaskRepository = Symbol('IOnboardingTaskRepository');
