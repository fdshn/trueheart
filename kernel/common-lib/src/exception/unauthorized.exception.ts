import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { Exception } from './exception';

export class UnauthorizedException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor(message = 'Chưa xác thực') {
    super(ErrorCodes.UNAUTHORIZED, message, undefined, ErrorOrigin);
  }
}
