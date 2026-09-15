import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import 'reflect-metadata';
import { resolveAllEntities } from './resolve-entities';

export interface IPersistencyOptions {
  inject: any[];
  /** Kết quả của `import * as entities from '../entity'`. */
  entities: Record<string, unknown>;
  /** Trả về connection string PostgreSQL. */
  useFactory: (...args: any[]) => string;
  /**
   * Danh sách class migration — kết quả của `import * as migrations from './migrations'`.
   *
   * Cố ý dùng danh sách class chứ không dùng glob: glob phải trỏ `.ts` khi chạy
   * ts-node và `.js` khi chạy từ `dist`, nên luôn sai ở một trong hai môi trường.
   */
  migrations?: Record<string, unknown>;

  /** Tự chạy migration còn thiếu lúc khởi động. Bật ở production. */
  migrationsRun?: boolean;

  /**
   * Cho TypeORM tự tạo/sửa bảng theo entity.
   *
   * KHÔNG dùng nữa — đã có migration. Giữ lại để tương thích ngược; `synchronize`
   * có thể âm thầm xoá cột và mất dữ liệu.
   *
   * @deprecated dùng `migrations` + `migrationsRun`
   */
  synchronize?: boolean;
}

/**
 * Điểm vào duy nhất để kết nối database.
 *
 * Service không được dùng `TypeOrmModule` trực tiếp (INVARIANTS.md mục 9) —
 * đi qua đây để mọi service có cùng cấu hình pool, cùng cách nạp entity và
 * cùng chính sách `synchronize`.
 */
@Module({})
export class PersistencyModule {
  public static forPostgresAsync(options: IPersistencyOptions): DynamicModule {
    const entities = resolveAllEntities(options.entities);
    const migrations = resolveAllEntities(options.migrations ?? {});

    return {
      global: true,
      module: PersistencyModule,
      imports: [
        TypeOrmModule.forRootAsync({
          inject: options.inject,
          useFactory: (...args: any[]) => {
            const url = options.useFactory(...args);

            return {
              type: 'postgres' as const,
              url,
              entities,
              migrations,
              migrationsRun: options.migrationsRun ?? false,
              migrationsTransactionMode: 'each' as const,
              synchronize: options.synchronize ?? false,
              autoLoadEntities: true,
              // Pool giữ nhỏ: đây là monolith một tiến trình, không phải cụm service.
              extra: { max: 25, min: 2 },
            };
          },
        }),
      ],
    };
  }
}
