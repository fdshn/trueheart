import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
  ISoftDeletableEntity,
} from '@chantam/service.persistency-lib/entities';
import { IUser } from '../models';

export interface IUserEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    IUser {}

export const IUserEntity = Symbol('IUserEntity');
