import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
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

@Entity('gift_posts')
@Index(['status', 'category'])
export class GiftPostEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IGiftPostEntity
{
  @ApiProperty()
  @Column({ name: 'title', type: 'varchar', length: 200, nullable: false })
  title: string;

  @ApiProperty()
  @Column({ name: 'description', type: 'text', nullable: false })
  description: string;

  @ApiProperty({ enum: GiftPostCategories })
  @Index()
  @Column({
    name: 'category',
    type: 'enum',
    enum: GiftPostCategories,
    nullable: false,
  })
  category: GiftPostCategories;

  @ApiProperty({ enum: GiftPostConditions })
  @Column({
    name: 'condition',
    type: 'enum',
    enum: GiftPostConditions,
    nullable: false,
  })
  condition: GiftPostConditions;

  /**
   * `bigint` vì giá trị tính bằng VNĐ — một chiếc xe máy đã vượt phạm vi `int`.
   * TypeORM trả `bigint` dưới dạng chuỗi, nên transformer đổi lại về number.
   */
  @ApiProperty({ description: 'Giá trị ước tính (VNĐ), do người đăng tự khai' })
  @Column({
    name: 'estimated_value',
    type: 'bigint',
    default: 0,
    nullable: false,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? 0 : Number(value)),
    },
  })
  estimatedValue: number;

  /**
   * Toạ độ chính xác nơi trao đồ.
   *
   * KHÔNG BAO GIỜ trả nguyên vẹn ra API công khai — đi qua `applyGeoJitter()`
   * trừ khi người gọi đã được duyệt nhận (đặc tả mục 1.3).
   */
  @ApiProperty({
    description: 'Toạ độ (đã làm nhiễu với người chưa được duyệt)',
    type: 'object',
    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
    required: ['lat', 'lng'],
  })
  @GeoColumn()
  location: IGeoPoint;

  @ApiProperty({ description: 'Nhãn khu vực hiển thị công khai' })
  @Column({ name: 'area_label', type: 'varchar', length: 200, nullable: false })
  areaLabel: string;

  @ApiProperty({ enum: GiftPostStatuses })
  @Index()
  @Column({
    name: 'status',
    type: 'enum',
    enum: GiftPostStatuses,
    default: GiftPostStatuses.DRAFT,
    nullable: false,
  })
  status: GiftPostStatuses;

  @ApiProperty()
  @Column({ name: 'total_quantity', type: 'int', default: 1, nullable: false })
  totalQuantity: number;

  /**
   * Tồn kho còn lại.
   *
   * Khi hiện thực duyệt đơn (kịch bản M-to-N, đặc tả mục 3.3), phải trừ bằng một
   * câu lệnh nguyên tử `UPDATE ... WHERE remaining_quantity > 0 RETURNING`,
   * KHÔNG đọc-rồi-ghi ở tầng ứng dụng — 1.000 người xin cùng lúc sẽ phát vượt kho.
   */
  @ApiProperty()
  @Column({
    name: 'remaining_quantity',
    type: 'int',
    default: 1,
    nullable: false,
  })
  remainingQuantity: number;

  @ApiProperty({ format: 'uuid' })
  @Index()
  @Column({ name: 'giver_id', type: 'uuid', nullable: false })
  giverId: string;
}
