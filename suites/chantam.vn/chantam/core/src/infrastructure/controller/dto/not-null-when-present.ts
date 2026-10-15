import { ValidateIf } from 'class-validator';

/**
 * Trường tuỳ chọn của PATCH mà KHÔNG được xoá về `null`.
 *
 * `@IsOptional()` bỏ qua mọi validator khi giá trị là `null` HOẶC `undefined`, nên
 * `{ "bankBin": null }` lọt qua DTO rồi gặp cột NOT NULL (500), hoặc gặp `.trim()` trên
 * null (500). Decorator này chỉ bỏ qua khi KHÔNG gửi; gửi `null` thì các validator phía
 * sau chạy và trả 400.
 *
 * Trường được phép xoá thì giữ `@IsOptional()` và khai kiểu `string | null`.
 */
export function NotNullWhenPresent(): PropertyDecorator {
  return ValidateIf((_object, value: unknown) => value !== undefined);
}
