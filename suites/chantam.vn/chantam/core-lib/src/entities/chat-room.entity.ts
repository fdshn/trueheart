import {
  IAuditableEntity,
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { IChatRoom } from '../models/chat';
export interface IChatRoomEntity
  extends IBaseEntity, IDistributedEntity, IAuditableEntity, IChatRoom {}
export const IChatRoomEntity = Symbol('IChatRoomEntity');
