import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';
export class CategoryNotFoundException extends ExceptionFrom(
  CoreErrors.CATEGORY_NOT_FOUND,
) {}
export class CategorySlugTakenException extends ExceptionFrom(
  CoreErrors.CATEGORY_SLUG_TAKEN,
) {}
export class CategoryParentCycleException extends ExceptionFrom(
  CoreErrors.CATEGORY_PARENT_CYCLE,
) {}
export class CategoryInUseException extends ExceptionFrom(
  CoreErrors.CATEGORY_IN_USE,
) {}
export class CategoryDepthExceededException extends ExceptionFrom(
  CoreErrors.CATEGORY_DEPTH_EXCEEDED,
) {}
export class CategoryPostTypeNotAllowedException extends ExceptionFrom(
  CoreErrors.CATEGORY_POST_TYPE_NOT_ALLOWED,
) {}
export class CategoryMergeInvalidException extends ExceptionFrom(
  CoreErrors.CATEGORY_MERGE_INVALID,
) {}
export class CategoryMergedCannotReopenException extends ExceptionFrom(
  CoreErrors.CATEGORY_MERGED_CANNOT_REOPEN,
) {}
