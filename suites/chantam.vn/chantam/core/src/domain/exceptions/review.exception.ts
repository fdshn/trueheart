import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class ReviewTransactionNotCompletedException extends ExceptionFrom(
  CoreErrors.REVIEW_TRANSACTION_NOT_COMPLETED,
) {}

export class ReviewAlreadySubmittedException extends ExceptionFrom(
  CoreErrors.REVIEW_ALREADY_SUBMITTED,
) {}
