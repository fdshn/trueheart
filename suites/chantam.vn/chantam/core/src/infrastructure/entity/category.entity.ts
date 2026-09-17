import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
} from '@chantam/service.persistency-lib';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';
@Entity('categories')
export class CategoryEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
  )
  implements ICategoryEntity
{
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) icon: string | null;
  @Column({ name: 'sort_order', type: 'int', default: 0 }) sortOrder: number;
  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
