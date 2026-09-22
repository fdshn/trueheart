import {
  CharityTransferStatuses,
  DeliveryMethods,
  GiftPostStatuses,
  PostTypes,
  ShipPayers,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  GeoColumn,
  IGeoPoint,
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
  PostgresSoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('posts')
@Index(['postType', 'status', 'categoryId'])
export class PostEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IPostEntity
{
  @ApiProperty({ enum: PostTypes })
  @Column({ name: 'post_type', type: 'enum', enum: PostTypes })
  postType: PostTypes;

  @ApiProperty({ format: 'uuid' })
  @Index()
  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ApiProperty({ format: 'uuid' })
  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({
    type: 'object',
    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
  })
  @GeoColumn()
  location: IGeoPoint;

  @ApiProperty()
  @Column({ name: 'area_label', type: 'varchar', length: 200 })
  areaLabel: string;

  @ApiProperty({ enum: GiftPostStatuses })
  @Index()
  @Column({ type: 'enum', enum: GiftPostStatuses })
  status: GiftPostStatuses;

  @ApiProperty()
  @Column({ name: 'total_quantity', type: 'int' })
  totalQuantity: number;

  @ApiProperty()
  @Column({ name: 'remaining_quantity', type: 'int' })
  remainingQuantity: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @ApiProperty({ nullable: true })
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @ApiProperty()
  @Column({ name: 'renewed_count', type: 'int', default: 0 })
  renewedCount: number;

  /**
   * Ba cột đếm tương tác, cập nhật trong cùng transaction với lần ghi cảm xúc/
   * bình luận/chia sẻ. Đọc từ đây chứ không COUNT(*) mỗi lần cuộn bảng tin.
   */
  @ApiProperty({ description: 'Số người đã bày tỏ cảm xúc' })
  @Column({ name: 'reaction_count', type: 'int', default: 0 })
  reactionCount: number;

  @ApiProperty({ description: 'Số bình luận gốc còn hiện' })
  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @ApiProperty({ description: 'Số lần chia sẻ đã ghi nhận' })
  @Column({ name: 'share_count', type: 'int', default: 0 })
  shareCount: number;

  @ApiProperty({ description: 'Bài Cần gấp / SOS (F17)' })
  @Column({ name: 'is_sos', type: 'boolean', default: false })
  isSos: boolean;

  @ApiProperty({ enum: DeliveryMethods, nullable: true })
  @Column({
    name: 'delivery_method',
    type: 'enum',
    enum: DeliveryMethods,
    nullable: true,
  })
  deliveryMethod: DeliveryMethods | null;

  @ApiProperty({ enum: ShipPayers, nullable: true })
  @Column({
    name: 'ship_payer',
    type: 'enum',
    enum: ShipPayers,
    nullable: true,
  })
  shipPayer: ShipPayers | null;

  @ApiProperty({ enum: CharityTransferStatuses, nullable: true })
  @Column({
    name: 'charity_transfer_status',
    type: 'enum',
    enum: CharityTransferStatuses,
    nullable: true,
  })
  charityTransferStatus: CharityTransferStatuses | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'charity_transfer_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  charityTransferRequestedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'charity_transfer_note',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  charityTransferNote: string | null;
}
