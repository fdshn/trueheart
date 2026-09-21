import { ChatRoomStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IChatRoomEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('chat_rooms')
// Khai ĐÚNG index mà migration 1790900000000 tạo, kể cả chiều sắp xếp: lệch một
// chữ là `migration:generate` sinh diff thừa mãi.
@Index('IDX_chat_rooms_giver', ['giverId', 'lastMessageAt'])
@Index('IDX_chat_rooms_receiver', ['receiverId', 'lastMessageAt'])
export class ChatRoomEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
  )
  implements IChatRoomEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'transaction_id', type: 'uuid', unique: true })
  transactionId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'giver_id', type: 'uuid' })
  giverId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'receiver_id', type: 'uuid' })
  receiverId: string;

  @ApiProperty({ enum: ChatRoomStatuses })
  @Column({
    type: 'enum',
    enum: ChatRoomStatuses,
    default: ChatRoomStatuses.OPEN,
  })
  status: ChatRoomStatuses;

  @ApiProperty({ nullable: true })
  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'giver_read_at', type: 'timestamptz', nullable: true })
  giverReadAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'receiver_read_at', type: 'timestamptz', nullable: true })
  receiverReadAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;
}
