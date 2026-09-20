import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class ReportNotFoundException extends ExceptionFrom(
  CoreErrors.REPORT_NOT_FOUND,
) {}

export class ReportDuplicatedException extends ExceptionFrom(
  CoreErrors.REPORT_DUPLICATED,
) {}

export class ReportInvalidStateException extends ExceptionFrom(
  CoreErrors.REPORT_INVALID_STATE,
) {}
