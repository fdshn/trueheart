import { IBaseEntity } from '@chantam/service.persistency-lib/entities';
import { IUserOnboardingTaskCompletion } from '../models';

export interface IUserOnboardingTaskCompletionEntity
  extends IBaseEntity, IUserOnboardingTaskCompletion {}

export const IUserOnboardingTaskCompletionEntity = Symbol(
  'IUserOnboardingTaskCompletionEntity',
);
