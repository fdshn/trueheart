import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGroupEntity,
  IGroupMembershipEntity,
  ISubTeamEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import {
  GeoColumn,
  IGeoPoint,
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
  PostgresSoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('groups')
@Index(['ownerId'])
export class GroupEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IGroupEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ name: 'cover_url', type: 'varchar', length: 500, nullable: true })
  coverUrl: string | null;

  /**
   * Bản sao Default Location của Owner lúc tạo — KHÔNG phải tham chiếu.
   *
   * Owner đổi Default Location hay tụt rank thì vùng của nhóm vẫn đứng yên
   * (BR-GRP-03).
   */
  @ApiProperty({
    type: 'object',
    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
  })
  @GeoColumn({ name: 'center_location' })
  centerLocation: IGeoPoint;

  @ApiProperty()
  @Column({ name: 'region_label', type: 'varchar', length: 200 })
  regionLabel: string;

  @ApiProperty({ example: 10 })
  @Column({ name: 'radius_km', type: 'int' })
  radiusKm: number;

  @ApiProperty({ description: 'Không tự hết hạn, không giới hạn lượt dùng' })
  @Column({ name: 'invite_code', type: 'varchar', length: 32 })
  inviteCode: string;

  @ApiProperty({ enum: GroupStatuses })
  @Column({ type: 'enum', enum: GroupStatuses, default: GroupStatuses.ACTIVE })
  status: GroupStatuses;

  @ApiProperty()
  @Column({ name: 'activated_at', type: 'timestamptz', default: () => 'now()' })
  activatedAt: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  @Column({ name: 'dissolved_at', type: 'timestamptz', nullable: true })
  dissolvedAt: Date | null;
}

@Entity('sub_teams')
@Index(['groupId'])
export class SubTeamEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements ISubTeamEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 150 })
  name: string;
}

@Entity('group_memberships')
export class GroupMembershipEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
  )
  implements IGroupMembershipEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Column({ name: 'sub_team_id', type: 'uuid', nullable: true })
  subTeamId: string | null;

  @ApiProperty({ enum: GroupMemberRoles })
  @Column({
    type: 'enum',
    enum: GroupMemberRoles,
    default: GroupMemberRoles.MEMBER,
  })
  role: GroupMemberRoles;

  @ApiProperty()
  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;
}
