import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IAuthPrincipal } from '../contracts';

/**
 * Lấy danh tính người gọi mà guard đã gắn vào request.
 *
 * Trả `undefined` ở endpoint `@Public()` — kiểu trả về nói rõ điều đó để bên
 * gọi buộc phải xử lý.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IAuthPrincipal | undefined =>
    context.switchToHttp().getRequest<{ user?: IAuthPrincipal }>().user,
);
