import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

/**
 * Mã, mã HTTP và câu chữ của mọi lỗi dưới đây nằm ở `CoreErrors`
 * (`core-lib/src/consts/error-catalog.ts`). Ở đây chỉ đặt tên class để nghiệp
 * vụ `throw` cho dễ đọc và để `instanceof` dùng được.
 */

export class UserNotFoundException extends ExceptionFrom(
  CoreErrors.USER_NOT_FOUND,
) {}

export class UsernameTakenException extends ExceptionFrom(
  CoreErrors.USERNAME_TAKEN,
) {}

export class EmailTakenException extends ExceptionFrom(
  CoreErrors.EMAIL_TAKEN,
) {}

export class PhoneTakenException extends ExceptionFrom(
  CoreErrors.PHONE_TAKEN,
) {}

export class ProfileIncompleteException extends ExceptionFrom(
  CoreErrors.PROFILE_INCOMPLETE,
) {}

export class InvalidCredentialsException extends ExceptionFrom(
  CoreErrors.INVALID_CREDENTIALS,
) {}

export class UserSuspendedException extends ExceptionFrom(
  CoreErrors.USER_SUSPENDED,
) {}

export class UserBannedException extends ExceptionFrom(
  CoreErrors.USER_BANNED,
) {}

export class RefreshTokenInvalidException extends ExceptionFrom(
  CoreErrors.REFRESH_TOKEN_INVALID,
) {}

export class TooManyLoginAttemptsException extends ExceptionFrom(
  CoreErrors.LOGIN_THROTTLED,
) {}

export class OtpInvalidException extends ExceptionFrom(
  CoreErrors.OTP_INVALID,
) {}

export class OtpTooSoonException extends ExceptionFrom(
  CoreErrors.OTP_TOO_SOON,
) {}

export class UserHasOpenTransactionsException extends ExceptionFrom(
  CoreErrors.USER_HAS_OPEN_TRANSACTIONS,
) {}
