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
   * Cho TypeORM tự tạo/sửa bảng theo entity.
   *
   * CHỈ bật ở môi trường development. Production phải dùng migration —
   * `synchronize` có thể âm thầm xoá cột và mất dữ liệu.
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
