import { ApiProperty } from '@nestjs/swagger';
import { decorate } from 'ts-mixer';
import { Column } from 'typeorm';

/** Danh tính công khai của bản ghi — đây là ID mà API và client dùng. */
export interface IDistributedEntity {
  globalId: string;
}

export abstract class PostgresDistributedEntity implements IDistributedEntity {
  @decorate(ApiProperty({ type: 'string', format: 'uuid' }))
  @decorate(
    Column({ type: 'uuid', name: 'global_id', unique: true, nullable: false }),
  )
  globalId!: string;
}
