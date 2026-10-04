import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class MeritUnitNotFoundException extends ExceptionFrom(
  CoreErrors.MERIT_UNIT_NOT_FOUND,
) {}

export class MeritDeclarationNotFoundException extends ExceptionFrom(
  CoreErrors.MERIT_DECLARATION_NOT_FOUND,
) {}

export class MeritDeclarationAlreadyCompletedException extends ExceptionFrom(
  CoreErrors.MERIT_DECLARATION_ALREADY_COMPLETED,
) {}
