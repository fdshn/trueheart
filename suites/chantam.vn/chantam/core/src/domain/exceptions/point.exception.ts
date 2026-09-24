import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class PointRuleUnavailableException extends ExceptionFrom(
  CoreErrors.POINT_RULE_UNAVAILABLE,
) {}

export class PointDailyCapReachedException extends ExceptionFrom(
  CoreErrors.POINT_DAILY_CAP_REACHED,
) {}

export class PointEntryNotReversibleException extends ExceptionFrom(
  CoreErrors.POINT_ENTRY_NOT_REVERSIBLE,
) {}
