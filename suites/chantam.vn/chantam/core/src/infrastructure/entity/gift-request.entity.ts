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
// Khai ĐÚNG ba index mà migration 1790700000000 tạo ra, kể cả mệnh đề partial.
// Lệch một chữ là `migration:generate` sinh diff thừa mãi, và `synchronize` ở
// máy dev dựng ra schema khác production.
//
// Cả ba đều `WHERE deleted_at IS NULL`: bản ghi đã xoá mềm không được chiếm chỗ
// trong ràng buộc duy nhất, để người dùng xin lại được sau khi rút.
@Index('UQ_gift_requests_post_requester', ['postId', 'requesterId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_gift_requests_post_status', ['postId', 'status'], {
  where: '"deleted_at" IS NULL',
})
@Index('IDX_gift_requests_requester_status', ['requesterId', 'status'], {
  where: '"deleted_at" IS NULL',
})
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
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ApiProperty({ format: 'uuid', description: 'ID người gửi yêu cầu xin nhận' })
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @ApiProperty({ description: 'Lời nhắn xin nhận' })
  @Column({ type: 'varchar', length: 500 })
  message: string;

  @ApiProperty({ enum: GiftRequestStatuses, description: 'Trạng thái yêu cầu' })
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

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Bài Muốn Tặng mà người gửi mang ra, khi lời tặng đi qua ' +
      '`POST /posts/{id}/offer-gift`. `null` ở yêu cầu xin nhận thường.',
  })
  @Column({ name: 'offering_post_id', type: 'uuid', nullable: true })
  offeringPostId: string | null;
}
