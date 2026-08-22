import { Exclude } from 'class-transformer';
import { decorate } from 'ts-mixer';
import { Column, Index } from 'typeorm';

export interface ISoftDeletableEntity {
  deletedAt: Date | null;
}

/**
 * Cố ý dùng `@Column` thường, KHÔNG dùng `@DeleteDateColumn` của TypeORM.
 *
 * Lý do: bản ghi đã xoá mềm vẫn phải resolve được từ các bản ghi tham chiếu tới
 * nó (lịch sử giao dịch, đơn xin đồ cũ). `@DeleteDateColumn` sẽ ẩn nó khỏi mọi
 * `find` và mọi join, làm hỏng lịch sử.
 *
 * Hệ quả: `softDelete()` / `restore()` / `withDeleted()` KHÔNG dùng được —
 * phải tự gán `deletedAt` và tự lọc ở nơi cần.
 */
export abstract class PostgresSoftDeletableEntity implements ISoftDeletableEntity {
  @decorate(Exclude())
  @decorate(Index())
  @decorate(Column({ type: 'timestamptz', name: 'deleted_at', nullable: true }))
  deletedAt: Date | null;
}
