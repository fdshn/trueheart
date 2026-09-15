import type { ApiErrorSpec } from '@chantam/service.common-lib/decorators';
import {
  TokenExpiredException,
  TokenInvalidException,
  TokenMissingException,
  TokenRevokedException,
} from './token.exception';

/**
 * Bốn lỗi mà **mọi** endpoint cần token đều có thể trả về, do `JwtAuthGuard`
 * ném ra trước khi request chạm tới controller.
 *
 * Dùng kèm `@ApiErrorResponses(...ApiTokenErrors, ...)` để khỏi chép lại ở từng
 * endpoint — và để thêm một loại lỗi token mới thì chỉ sửa một chỗ.
 */
export const ApiTokenErrors: ApiErrorSpec[] = [
  TokenMissingException,
  TokenInvalidException,
  TokenExpiredException,
  TokenRevokedException,
];
