import { ErrorCodes, ErrorOrigin } from '@chantam.vn/chantam.core-lib/consts';
import { Exception } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';

export class UsernameTakenException extends Exception {
  public static readonly httpStatus = HttpStatus.CONFLICT;

  public constructor(username: string) {
    super(
      ErrorCodes.USERNAME_TAKEN,
      `Tên đăng nhập "${username}" đã có người dùng`,
      undefined,
      ErrorOrigin,
    );
  }
}

/**
 * Dùng chung cho cả "không có tài khoản này" lẫn "sai mật khẩu".
 *
 * Tách hai trường hợp ra sẽ biến endpoint đăng nhập thành công cụ dò xem username
 * hay email nào đang tồn tại trong hệ thống.
 */
export class InvalidCredentialsException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    super(
      ErrorCodes.INVALID_CREDENTIALS,
      'Tên đăng nhập hoặc mật khẩu không đúng',
      undefined,
      ErrorOrigin,
    );
  }
}

export class UserSuspendedException extends Exception {
  public static readonly httpStatus = HttpStatus.FORBIDDEN;

  public constructor(until: Date | null) {
    super(
      ErrorCodes.USER_SUSPENDED,
      until
        ? `Tài khoản đang bị tạm khoá tới ${until.toISOString()}`
        : 'Tài khoản đang bị tạm khoá',
      undefined,
      ErrorOrigin,
    );
  }
}

export class UserBannedException extends Exception {
  public static readonly httpStatus = HttpStatus.FORBIDDEN;

  public constructor() {
    super(
      ErrorCodes.USER_BANNED,
      'Tài khoản đã bị khoá vĩnh viễn',
      undefined,
      ErrorOrigin,
    );
  }
}

export class RefreshTokenInvalidException extends Exception {
  public static readonly httpStatus = HttpStatus.UNAUTHORIZED;

  public constructor() {
    // Không phân biệt "không tồn tại" / "đã thu hồi" / "hết hạn": cả ba đều
    // dẫn tới cùng một hành động ở client là đăng nhập lại.
    super(
      ErrorCodes.REFRESH_TOKEN_INVALID,
      'Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại',
      undefined,
      ErrorOrigin,
    );
  }
}

export class TooManyLoginAttemptsException extends Exception {
  public static readonly httpStatus = HttpStatus.TOO_MANY_REQUESTS;

  public constructor(retryAfterSeconds: number) {
    super(
      ErrorCodes.INVALID_CREDENTIALS,
      `Sai quá nhiều lần. Thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút`,
      undefined,
      ErrorOrigin,
    );
  }
}

export class OtpInvalidException extends Exception {
  public static readonly httpStatus = HttpStatus.BAD_REQUEST;

  public constructor() {
    // Không phân biệt "sai mã" với "mã đã hết hạn": biết mã còn sống hay không
    // là một mẩu thông tin cho kẻ dò.
    super(
      ErrorCodes.OTP_INVALID,
      'Mã xác minh không đúng hoặc đã hết hạn',
      undefined,
      ErrorOrigin,
    );
  }
}

export class OtpTooSoonException extends Exception {
  public static readonly httpStatus = HttpStatus.TOO_MANY_REQUESTS;

  public constructor(retryAfterSeconds: number) {
    super(
      ErrorCodes.OTP_TOO_SOON,
      `Vui lòng thử lại sau ${retryAfterSeconds} giây`,
      undefined,
      ErrorOrigin,
    );
  }
}

export class UserHasOpenTransactionsException extends Exception {
  public static readonly httpStatus = HttpStatus.CONFLICT;

  public constructor(count: number) {
    super(
      ErrorCodes.USER_HAS_OPEN_TRANSACTIONS,
      `Còn ${count} giao dịch chưa hoàn tất, chưa thể xoá tài khoản`,
      undefined,
      ErrorOrigin,
    );
  }
}
