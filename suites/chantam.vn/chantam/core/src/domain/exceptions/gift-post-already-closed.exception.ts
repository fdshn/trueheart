import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GiftPostAlreadyClosedException extends ExceptionFrom(
  CoreErrors.GIFT_POST_ALREADY_CLOSED,
) {}
