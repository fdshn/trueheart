import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
  ISoftDeletableEntity,
} from '@chantam/service.persistency-lib/entities';
import { IGiftPost } from '../models';

export interface IGiftPostEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    IAuditableEntity,
    ISoftDeletableEntity,
    IGiftPost {}

/** Token DI — service bind interface này với class TypeORM cụ thể. */
export const IGiftPostEntity = Symbol('IGiftPostEntity');
