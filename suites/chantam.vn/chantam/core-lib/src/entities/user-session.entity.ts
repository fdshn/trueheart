import {
  IAuditableEntity,
  IBaseEntity,
} from '@chantam/service.persistency-lib/entities';
import { IUserSession } from '../models';

/**
 * Cố ý KHÔNG kế thừa `IDistributedEntity`: phiên không bao giờ được tham chiếu
 * bằng ID công khai. Client giữ refresh token, không giữ ID phiên.
 */
export interface IUserSessionEntity
  extends IBaseEntity, IAuditableEntity, IUserSession {}

export const IUserSessionEntity = Symbol('IUserSessionEntity');
