import {
  CharityTransferStatuses,
  DeliveryMethods,
  GiftPostStatuses,
  PostSelectionModes,
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

  @ApiProperty({
    enum: PostSelectionModes,
    description:
      'Chế độ tìm người nhận. Chỉ có ý nghĩa với bài OFFER. ' +
      'INSTANT=chọn ngay, OPTIMAL=7 ngày, EXTENDED=30 ngày.',
    default: PostSelectionModes.OPTIMAL,
  })
  @Column({
    name: 'selection_mode',
    type: 'enum',
    enum: PostSelectionModes,
    default: PostSelectionModes.OPTIMAL,
  })
  selectionMode: PostSelectionModes;

  @ApiProperty({
    nullable: true,
    description:
      'Deadline tự động chọn người nhận. null cho đến khi có request đầu tiên.',
  })
  @Column({ name: 'selection_deadline', type: 'timestamptz', nullable: true })
  selectionDeadline: Date | null;

  @ApiProperty({ description: 'Tổng số lượt thích bài đăng.', default: 0 })
  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;
}
