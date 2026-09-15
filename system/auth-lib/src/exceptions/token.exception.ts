import { ExceptionFrom } from '@chantam/service.common-lib/exception';
import { AuthErrors } from '../consts';

/**
 * Mã, mã HTTP và câu chữ nằm ở `AuthErrors` (`consts/error-catalog.ts`). Ở đây
 * chỉ đặt tên class để guard `throw` cho dễ đọc.
 */

export class TokenMissingException extends ExceptionFrom(
  AuthErrors.TOKEN_MISSING,
) {}

export class TokenInvalidException extends ExceptionFrom(
  AuthErrors.TOKEN_INVALID,
) {}

export class TokenExpiredException extends ExceptionFrom(
  AuthErrors.TOKEN_EXPIRED,
) {}

export class TokenRevokedException extends ExceptionFrom(
  AuthErrors.TOKEN_REVOKED,
) {}
