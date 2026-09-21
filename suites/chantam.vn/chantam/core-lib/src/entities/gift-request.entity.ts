import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
  ISoftDeletableEntity,
} from '@chantam/service.persistency-lib/entities';
import { IGiftRequest } from '../models/gift-request';

export interface IGiftRequestEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    IGiftRequest {}

export const IGiftRequestEntity = Symbol('IGiftRequestEntity');
