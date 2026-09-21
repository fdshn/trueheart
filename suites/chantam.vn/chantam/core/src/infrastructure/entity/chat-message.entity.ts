import { IChatMessageEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

@Entity('chat_messages')
@Index('IDX_chat_messages_room_created', ['roomId', 'createdAt', 'id'])
export class ChatMessageEntity
  extends Mixin(PostgresBaseEntity, PostgresDistributedEntity)
  implements IChatMessageEntity
{
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ApiProperty({ maxLength: 2000 })
  @Column({ type: 'varchar', length: 2000 })
  body: string;

  // Chỉ `createdAt`: trigger ở database chặn UPDATE và DELETE, nên `updatedAt`
  // sẽ là một cột không bao giờ đổi giá trị.
  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
