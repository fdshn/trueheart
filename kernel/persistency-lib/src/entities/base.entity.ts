import { Exclude } from 'class-transformer';
import { decorate } from 'ts-mixer';
import { PrimaryGeneratedColumn } from 'typeorm';

/**
 * Khoá chính tăng tự động, **không lộ ra ngoài**.
 *
 * ID nội bộ dạng số cho index nhỏ và join nhanh; danh tính công khai là
 * `globalId` (UUID) của `PostgresDistributedEntity`. Nhờ vậy client không đoán
 * được số lượng bản ghi trong hệ thống.
 */
export interface IBaseEntity {
  id: number;
}

export abstract class PostgresBaseEntity implements IBaseEntity {
  @decorate(Exclude())
  @decorate(PrimaryGeneratedColumn({ type: 'int', name: 'id' }))
  id!: number;
}
