import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class ContentBlockedTermsException extends ExceptionFrom(
  CoreErrors.CONTENT_BLOCKED_TERMS,
) {}

export class ContentCommentNotFoundException extends ExceptionFrom(
  CoreErrors.CONTENT_COMMENT_NOT_FOUND,
) {}

export class ContentEditWindowClosedException extends ExceptionFrom(
  CoreErrors.CONTENT_EDIT_WINDOW_CLOSED,
) {}
