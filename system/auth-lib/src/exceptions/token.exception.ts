import { Exception } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorOrigin } from '../consts';

export class TokenMissingException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    super(
      ErrorCodes.TOKEN_MISSING,
      'Thiếu access token',
      undefined,
      ErrorOrigin,
    );
  }
}

export class TokenInvalidException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    // Cố ý KHÔNG nói rõ sai ở đâu (chữ ký? định dạng? người dùng không tồn
    // tại?). Thông báo chi tiết giúp kẻ tấn công dò nhanh hơn.
    super(
      ErrorCodes.TOKEN_INVALID,
      'Access token không hợp lệ',
      undefined,
      ErrorOrigin,
    );
  }
}

export class TokenExpiredException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    // Tách riêng khỏi TOKEN_INVALID để client biết khi nào nên tự refresh thay
    // vì đá người dùng ra màn đăng nhập.
    super(
      ErrorCodes.TOKEN_EXPIRED,
      'Access token đã hết hạn',
      undefined,
      ErrorOrigin,
    );
  }
}

export class TokenRevokedException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    // Tách khỏi TOKEN_EXPIRED: token này chưa hết hạn nhưng đã bị thu hồi, nên
    // refresh cũng vô ích — client phải đưa người dùng về màn đăng nhập.
    super(
      ErrorCodes.TOKEN_REVOKED,
      'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại',
      undefined,
      ErrorOrigin,
    );
  }
}
