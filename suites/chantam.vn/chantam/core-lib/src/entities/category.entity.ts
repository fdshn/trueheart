import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { ICategory } from '../models/category';
export interface ICategoryEntity
  extends IBaseEntity, IDistributedEntity, IAuditableEntity, ICategory {
  deletedAt: Date | null;
}
export const ICategoryEntity = Symbol('ICategoryEntity');
