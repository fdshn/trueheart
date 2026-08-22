import { Ctor } from '@chantam/service.common-lib/utils';

/** Class entity của TypeORM. */
export type EntityClass = Ctor;

/**
 * Chuyển `import * as entities from '../entity'` thành mảng class cho TypeORM.
 *
 * Nhờ vậy thêm entity mới chỉ cần export nó ở barrel `entity/index.ts`, không
 * phải sửa thêm chỗ nào nữa — bớt một bước dễ quên.
 */
export function resolveAllEntities(
  entities: Record<string, unknown>,
): EntityClass[] {
  return Object.values(entities).filter(
    (candidate): candidate is EntityClass => typeof candidate === 'function',
  );
}
