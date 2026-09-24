import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  GeoColumn,
  IGeoPoint,
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
  PostgresSoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('users')
export class UserEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IUserEntity
{
  @ApiProperty()
  @Index({ unique: true })
  @Column({ name: 'username', type: 'varchar', length: 50, nullable: false })
  username: string;

  /**
   * `@Exclude()` là lớp chặn cuối cùng ở tầng serialize. Đừng dựa vào nó — không
   * bao giờ đưa cả entity này vào response DTO; luôn ánh xạ sang DTO riêng.
   */
  @Exclude()
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  passwordHash: string;

  // Email và SĐT là duy nhất khi có giá trị. Index một phần (WHERE ... IS NOT
  // NULL) để nhiều tài khoản cùng bỏ trống mà không đụng ràng buộc duy nhất.
  @ApiPropertyOptional()
  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Exclude()
  @Index({ unique: true, where: '"phone" IS NOT NULL' })
  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'full_name', type: 'varchar', length: 100, nullable: true })
  fullName: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  /**
   * Vị trí mặc định (F11) — KHÁC vị trí GPS hiện tại.
   *
   * Không bao giờ trả thẳng ra API công khai; đi qua `applyGeoJitter()` như mọi
   * toạ độ khác.
   */
  @Exclude()
  @GeoColumn({
    name: 'default_location',
    nullable: true,
    precision: 15,
  })
  defaultLocation: IGeoPoint | null;

  @ApiProperty({ enum: UserRanks })
  @Index()
  @Column({
    name: 'rank',
    type: 'enum',
    enum: UserRanks,
    default: UserRanks.VIEWER,
    nullable: false,
  })
  rank: UserRanks;

  @ApiProperty({ enum: UserStatuses })
  @Index()
  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatuses,
    default: UserStatuses.ACTIVE,
    nullable: false,
  })
  status: UserStatuses;

  /**
   * Khoá chống thưởng lặp cho `PHONE_VERIFIED_FIRST_TIME` (F09): đã có giá trị
   * thì đổi SĐT về sau không thưởng lại.
   */
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt: Date | null;

  @Exclude()
  @Column({ name: 'suspended_until', type: 'timestamptz', nullable: true })
  suspendedUntil: Date | null;

  /**
   * `@Exclude()` vì đây là dữ liệu vận hành, không phải thông tin hồ sơ: lộ ra
   * công khai là cho bất kỳ ai biết một người có đang dùng app hay không.
   */
  @Exclude()
  @Column({
    name: 'last_active_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActiveAt: Date;
}
