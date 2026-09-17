import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';
export class CategoryNotFoundException extends ExceptionFrom(
  CoreErrors.CATEGORY_NOT_FOUND,
) {}
export class CategorySlugTakenException extends ExceptionFrom(
  CoreErrors.CATEGORY_SLUG_TAKEN,
) {}
