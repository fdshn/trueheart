import {
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { IChatMessage } from '../models/chat';

/**
 * Cố ý KHÔNG mixin `IAuditableEntity` hay `ISoftDeletableEntity`: tin nhắn chỉ
 * được ghi thêm, nên `updatedAt` và `deletedAt` là hai cột không bao giờ đổi
 * giá trị — có chúng chỉ mời người sau tưởng là sửa được.
 */
export interface IChatMessageEntity
  extends IBaseEntity, IDistributedEntity, IChatMessage {
  createdAt: Date;
}
export const IChatMessageEntity = Symbol('IChatMessageEntity');
