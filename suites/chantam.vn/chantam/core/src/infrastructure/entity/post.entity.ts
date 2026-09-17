import {
  GiftPostStatuses,
  PostTypes,
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
}
