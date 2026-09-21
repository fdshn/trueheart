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

export class PostNotRenewableException extends ExceptionFrom(
  CoreErrors.POST_NOT_RENEWABLE,
) {}

export class PostRenewalLimitReachedException extends ExceptionFrom(
  CoreErrors.POST_RENEWAL_LIMIT_REACHED,
) {}

export class DiscoveryOriginUnavailableException extends ExceptionFrom(
  CoreErrors.DISCOVERY_ORIGIN_UNAVAILABLE,
) {}

export class PostSosNotAllowedException extends ExceptionFrom(
  CoreErrors.POST_SOS_NOT_ALLOWED,
) {}

export class PostCharityTransferInvalidStateException extends ExceptionFrom(
  CoreErrors.POST_CHARITY_TRANSFER_INVALID_STATE,
) {}
