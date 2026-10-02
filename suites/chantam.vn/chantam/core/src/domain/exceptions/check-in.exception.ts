import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class CheckInAlreadyRecordedException extends ExceptionFrom(
  CoreErrors.CHECK_IN_ALREADY_RECORDED,
) {}

export class CheckInPolicyUnavailableException extends ExceptionFrom(
  CoreErrors.CHECK_IN_POLICY_UNAVAILABLE,
) {}

export class CheckInRepairDateInvalidException extends ExceptionFrom(
  CoreErrors.CHECK_IN_REPAIR_DATE_INVALID,
) {}

export class CheckInRepairCreditInsufficientException extends ExceptionFrom(
  CoreErrors.CHECK_IN_REPAIR_CREDIT_INSUFFICIENT,
) {}

export class CheckInRepairUnavailableException extends ExceptionFrom(
  CoreErrors.CHECK_IN_REPAIR_UNAVAILABLE,
) {}
