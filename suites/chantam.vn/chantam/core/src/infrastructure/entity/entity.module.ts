import {
  IGiftPostEntity,
  IUserEntity,
  IUserSessionEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { Global, Module } from '@nestjs/common';
import { GiftPostEntity } from './gift-post.entity';
import { UserSessionEntity } from './user-session.entity';
import { UserEntity } from './user.entity';

/**
 * Gắn interface entity (khai báo ở `core-lib`) với class TypeORM cụ thể.
 *
 * Nhờ lớp gián tiếp này, repository nhận entity qua token DI thay vì import
 * trực tiếp class — đúng quy tắc phụ thuộc của Clean Architecture.
 */
@Global()
@Module({
  providers: [
    { provide: IGiftPostEntity, useValue: GiftPostEntity },
    { provide: IUserEntity, useValue: UserEntity },
    { provide: IUserSessionEntity, useValue: UserSessionEntity },
  ],
  exports: [IGiftPostEntity, IUserEntity, IUserSessionEntity],
})
export class EntityModule {}
