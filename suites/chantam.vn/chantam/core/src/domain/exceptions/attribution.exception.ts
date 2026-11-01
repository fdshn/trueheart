import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class AttributionNotConfiguredException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_NOT_CONFIGURED,
) {}

export class AttributionTokenInvalidException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_TOKEN_INVALID,
) {}

export class AttributionTokenExpiredException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_TOKEN_EXPIRED,
) {}

export class AttributionTokenRevokedException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_TOKEN_REVOKED,
) {}

export class AttributionAlreadyClaimedException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_ALREADY_CLAIMED,
) {}

export class AttributionReferrerExistsException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_REFERRER_EXISTS,
) {}

export class AttributionSelfReferralException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_SELF_REFERRAL,
) {}

export class AttributionNotEligibleException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_NOT_ELIGIBLE,
) {}

export class AttributionLinkNotFoundException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_LINK_NOT_FOUND,
) {}

export class AttributionTargetNotFoundException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_TARGET_NOT_FOUND,
) {}

export class AttributionClaimNotFoundException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_CLAIM_NOT_FOUND,
) {}

export class AttributionClaimAlreadyReviewedException extends ExceptionFrom(
  CoreErrors.ATTRIBUTION_CLAIM_ALREADY_REVIEWED,
) {}
