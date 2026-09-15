import { IUserSessionEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
} from '@chantam/service.persistency-lib';
import { Exclude } from 'class-transformer';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

/**
 * Toàn bộ bảng này là dữ liệu nhạy cảm — không cột nào được trả ra API. Vì vậy
 * không có `@ApiProperty` ở đâu cả, và mọi cột đều `@Exclude()`.
 */
@Entity('user_sessions')
@Index(['userId', 'deviceId'])
export class UserSessionEntity
  extends Mixin(PostgresBaseEntity, PostgresAuditableEntity)
  implements IUserSessionEntity
{
  @Exclude()
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /**
   * Chỉ băm, không lưu token gốc. Rò database thì kẻ tấn công vẫn không mạo
   * danh được phiên nào.
   */
  @Exclude()
  @Index({ unique: true })
  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  refreshTokenHash: string;

  @Exclude()
  @Column({ name: 'device_id', type: 'varchar', length: 100, nullable: false })
  deviceId: string;

  @Exclude()
  @Column({ name: 'fcm_token', type: 'varchar', length: 255, nullable: true })
  fcmToken: string | null;

  @Exclude()
  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: false })
  expiresAt: Date;

  /** Có giá trị = đã thu hồi. Giữ bản ghi lại để truy vết, không xoá. */
  @Exclude()
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
