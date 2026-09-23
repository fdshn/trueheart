import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IOnboardingTaskProgressDto } from '@chantam.vn/chantam.core-lib/dto';
import { IOnboardingTaskEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IOnboardingTaskRepository extends Repository<IOnboardingTaskEntity> {
  findActiveByEvidenceType(
    evidenceType: OnboardingTaskEvidenceTypes,
  ): Promise<IOnboardingTaskEntity | null>;
  findUserTaskProgress(userId: string): Promise<IOnboardingTaskProgressDto[]>;
}

export const IOnboardingTaskRepository = Symbol('IOnboardingTaskRepository');
