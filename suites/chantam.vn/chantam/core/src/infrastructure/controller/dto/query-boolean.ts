import { Transform } from 'class-transformer';

/**
 * Đọc một tham số query boolean cho đúng.
 *
 * Query string luôn là chuỗi, và `@Type(() => Boolean)` gọi `Boolean('false')` — ra
 * `true` vì chuỗi khác rỗng là truthy. Bộ lọc vì thế BẬT đúng lúc người dùng tắt nó.
 *
 * Chỉ đổi đúng `'true'`/`'false'`. Giá trị khác giữ nguyên để `@IsBoolean()` đứng sau
 * trả 400 — nuốt `'abc'` thành `false` là che một lỗi của client thay vì báo nó.
 * Boolean thật (body JSON) đi qua nguyên vẹn.
 */
export function QueryBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
