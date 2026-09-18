import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
  ISoftDeletableEntity,
} from '@chantam/service.persistency-lib/entities';
import { IOnboardingTask } from '../models';

export interface IOnboardingTaskEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    IOnboardingTask {}

export const IOnboardingTaskEntity = Symbol('IOnboardingTaskEntity');
