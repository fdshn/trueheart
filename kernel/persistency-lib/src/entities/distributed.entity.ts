import { ApiProperty } from '@nestjs/swagger';
import { decorate } from 'ts-mixer';
import { Column } from 'typeorm';

/** Danh tính công khai của bản ghi — đây là ID mà API và client dùng. */
export interface IDistributedEntity {
  globalId: string;
}

export abstract class PostgresDistributedEntity implements IDistributedEntity {
  @decorate(
    ApiProperty({
      type: 'string',
      format: 'uuid',
      description:
        'Định danh công khai của bản ghi — ID mà API và client dùng. Cố ý KHÔNG dùng khoá chính dạng số tăng dần, để không ai đoán được số lượng bản ghi hay dò sang bản ghi của người khác.',
    }),
  )
  @decorate(
    Column({ type: 'uuid', name: 'global_id', unique: true, nullable: false }),
  )
  globalId!: string;
}
