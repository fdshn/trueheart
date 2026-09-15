import { IUserSessionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IUserSessionRepository extends Repository<IUserSessionEntity> {
  /** Phiên còn hiệu lực ứng với bản băm token: chưa thu hồi và chưa hết hạn. */
  findActiveByTokenHash(hash: string): Promise<IUserSessionEntity | null>;

  /** Thu hồi mọi phiên của một thiết bị. Trả về số phiên vừa thu hồi. */
  revokeByDevice(userId: string, deviceId: string): Promise<number>;
}

export const IUserSessionRepository = Symbol('IUserSessionRepository');
