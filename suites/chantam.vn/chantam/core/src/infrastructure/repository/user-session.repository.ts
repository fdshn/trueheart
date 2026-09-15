import { IUserSessionRepository } from '@/domain/ports/repository';
import { IUserSessionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

@Injectable()
export class UserSessionRepository
  extends Repository<IUserSessionEntity>
  implements IUserSessionRepository
{
  public constructor(
    @Inject(IUserSessionEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async findActiveByTokenHash(
    hash: string,
  ): Promise<IUserSessionEntity | null> {
    return this.createQueryBuilder('session')
      .where('session.refreshTokenHash = :hash', { hash })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > now()')
      .getOne();
  }

  public async revokeByDevice(
    userId: string,
    deviceId: string,
  ): Promise<number> {
    const result = await this.createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where('user_id = :userId', { userId })
      .andWhere('device_id = :deviceId', { deviceId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }
}
