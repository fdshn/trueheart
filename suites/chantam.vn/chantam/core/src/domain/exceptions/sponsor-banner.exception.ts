import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class SponsorBannerNotFoundException extends ExceptionFrom(
  CoreErrors.SPONSOR_BANNER_NOT_FOUND,
) {}

export class SponsorBannerApprovalAlreadyDecidedException extends ExceptionFrom(
  CoreErrors.SPONSOR_BANNER_APPROVAL_ALREADY_DECIDED,
) {}

export class SponsorBannerNotServingException extends ExceptionFrom(
  CoreErrors.SPONSOR_BANNER_NOT_SERVING,
) {}
