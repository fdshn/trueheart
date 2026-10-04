import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class DharmaThreadNotFoundException extends ExceptionFrom(
  CoreErrors.DHARMA_THREAD_NOT_FOUND,
) {}

export class DharmaThreadLockedException extends ExceptionFrom(
  CoreErrors.DHARMA_THREAD_LOCKED,
) {}
