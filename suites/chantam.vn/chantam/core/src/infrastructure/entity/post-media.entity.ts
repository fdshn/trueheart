import { IPostMediaEntity } from '@chantam.vn/chantam.core-lib/entities';
import { PostgresBaseEntity } from '@chantam/service.persistency-lib';
import { ApiProperty } from '@nestjs/swagger';
import { Mixin } from 'ts-mixer';
import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

@Entity('post_media')
@Index(['postId', 'sortOrder'], { unique: true })
export class PostMediaEntity
  extends Mixin(PostgresBaseEntity)
  implements IPostMediaEntity
{
  @Index()
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @Column({ name: 'r2_key', type: 'varchar', length: 500 })
  r2Key: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
