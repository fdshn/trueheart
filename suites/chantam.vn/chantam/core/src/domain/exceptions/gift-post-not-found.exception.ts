import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GiftPostNotFoundException extends ExceptionFrom(
  CoreErrors.GIFT_POST_NOT_FOUND,
) {}
