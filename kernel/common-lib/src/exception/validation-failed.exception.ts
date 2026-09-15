import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { Exception } from './exception';

/**
 * Do `ValidationPipe` ném ra khi DTO không qua được class-validator.
 *
 * Nằm ở đây thay vì trong `base-controller.module.ts` để controller còn khai
 * được nó trong tài liệu API — mọi endpoint nhận body, query hay param đều có
 * thể trả về lỗi này.
 */
export class ValidationFailedException extends Exception {
  public static readonly httpStatus = HttpStatus.BAD_REQUEST;

  public constructor(messages: string[]) {
    super(
      ErrorCodes.VALIDATION_FAILED,
      messages[0] ?? 'Dữ liệu gửi lên không hợp lệ',
      messages.slice(1),
      ErrorOrigin,
    );
  }
}
