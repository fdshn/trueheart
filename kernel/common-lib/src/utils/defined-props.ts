/**
 * Loại bỏ các key có giá trị `undefined`.
 *
 * Cần cho thao tác cập nhật một phần: TypeORM coi `undefined` là "không đổi",
 * nhưng trải object với key `undefined` vẫn ghi đè giá trị đích trong một số
 * đường dẫn code. Lọc trước cho chắc.
 */
export function definedProps<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
