import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class PointRuleUnavailableException extends ExceptionFrom(
  CoreErrors.POINT_RULE_UNAVAILABLE,
) {}
