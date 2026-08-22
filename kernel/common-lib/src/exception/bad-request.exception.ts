import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { Exception } from './exception';

export class BadRequestException extends Exception {
  public static readonly httpStatus = HttpStatus.BAD_REQUEST;

  public constructor(message: string, explains?: string[]) {
    super(ErrorCodes.BAD_REQUEST, message, explains, ErrorOrigin);
  }
}
