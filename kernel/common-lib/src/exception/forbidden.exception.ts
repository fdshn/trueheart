import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { Exception } from './exception';

export class ForbiddenException extends Exception {
  public static readonly httpStatus = HttpStatus.FORBIDDEN;

  public constructor(message = 'Không đủ quyền thực hiện thao tác này') {
    super(ErrorCodes.FORBIDDEN, message, undefined, ErrorOrigin);
  }
}
