import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class DharmaContentNotFoundException extends ExceptionFrom(
  CoreErrors.DHARMA_CONTENT_NOT_FOUND,
) {}

export class DharmaContentNotRecitableException extends ExceptionFrom(
  CoreErrors.DHARMA_CONTENT_NOT_RECITABLE,
) {}

export class DharmaRecitationNotFoundException extends ExceptionFrom(
  CoreErrors.DHARMA_RECITATION_NOT_FOUND,
) {}

export class DharmaRecitationAlreadyCompletedException extends ExceptionFrom(
  CoreErrors.DHARMA_RECITATION_ALREADY_COMPLETED,
) {}
