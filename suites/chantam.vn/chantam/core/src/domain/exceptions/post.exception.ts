import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class PostNotFoundException extends ExceptionFrom(
  CoreErrors.POST_NOT_FOUND,
) {}

export class PostQuotaExceededException extends ExceptionFrom(
  CoreErrors.POST_QUOTA_EXCEEDED,
) {}

export class PostInvalidStateException extends ExceptionFrom(
  CoreErrors.POST_INVALID_STATE,
) {}

export class PostMediaLimitExceededException extends ExceptionFrom(
  CoreErrors.POST_MEDIA_LIMIT_EXCEEDED,
) {}

export class PostMediaOrderInvalidException extends ExceptionFrom(
  CoreErrors.POST_MEDIA_ORDER_INVALID,
) {}
