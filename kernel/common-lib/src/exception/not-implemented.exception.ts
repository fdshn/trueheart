import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { Exception } from './exception';

export class NotImplementedException extends Exception {
  public static readonly httpStatus = HttpStatus.NOT_IMPLEMENTED;

  public constructor(feature: string) {
    super(
      ErrorCodes.NOT_IMPLEMENTED,
      `Tính năng chưa được hiện thực: ${feature}`,
      undefined,
      ErrorOrigin,
    );
  }
}
