import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GiftRequestNotFoundException extends ExceptionFrom(
  CoreErrors.GIFT_REQUEST_NOT_FOUND,
) {}

export class GiftRequestDuplicatedException extends ExceptionFrom(
  CoreErrors.GIFT_REQUEST_DUPLICATED,
) {}

export class CannotRequestOwnPostException extends ExceptionFrom(
  CoreErrors.CANNOT_REQUEST_OWN_POST,
) {}

export class PostNotAcceptingRequestsException extends ExceptionFrom(
  CoreErrors.POST_NOT_ACCEPTING_REQUESTS,
) {}
