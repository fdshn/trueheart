import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
  PostgresSoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('gift_requests')
@Index(['postId', 'status'])
@Index(['requesterId', 'status'])
export class GiftRequestEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IGiftRequestEntity
{
  @ApiProperty({ format: 'uuid', description: 'ID bài đăng được xin' })
  @Index()
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ApiProperty({ format: 'uuid', description: 'ID người gửi yêu cầu xin nhận' })
  @Index()
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @ApiProperty({ description: 'Lời nhắn xin nhận' })
  @Column({ type: 'varchar', length: 500 })
  message: string;

  @ApiProperty({ enum: GiftRequestStatuses, description: 'Trạng thái yêu cầu' })
  @Index()
  @Column({
    type: 'enum',
    enum: GiftRequestStatuses,
    default: GiftRequestStatuses.PENDING,
  })
  status: GiftRequestStatuses;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({
    name: 'queue_joined_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  queueJoinedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;
}
