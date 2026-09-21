import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { INotificationEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

@Entity('notifications')
@Index('IDX_notifications_inbox', ['userId', 'createdAt'])
export class NotificationEntity
  extends Mixin(PostgresBaseEntity, PostgresDistributedEntity)
  implements INotificationEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ enum: NotificationTypes })
  @Column({ type: 'varchar', length: 64 })
  type: NotificationTypes;

  @ApiProperty()
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 1000 })
  body: string;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  referenceType: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 200,
    nullable: true,
    unique: true,
  })
  idempotencyKey: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'pushed_at', type: 'timestamptz', nullable: true })
  pushedAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
