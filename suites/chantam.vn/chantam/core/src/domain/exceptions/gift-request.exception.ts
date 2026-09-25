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

export class OpenRequestQuotaExceededException extends ExceptionFrom(
  CoreErrors.OPEN_REQUEST_QUOTA_EXCEEDED,
) {}

export class RedemptionNotAvailableException extends ExceptionFrom(
  CoreErrors.REDEMPTION_NOT_AVAILABLE,
) {}

export class RedemptionPriceUnavailableException extends ExceptionFrom(
  CoreErrors.REDEMPTION_PRICE_UNAVAILABLE,
) {}

export class RedemptionInsufficientPointsException extends ExceptionFrom(
  CoreErrors.REDEMPTION_INSUFFICIENT_POINTS,
) {}
