import {
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { INotification } from '../models/notification';
export interface INotificationEntity
  extends IBaseEntity, IDistributedEntity, INotification {
  createdAt: Date;
}
export const INotificationEntity = Symbol('INotificationEntity');
