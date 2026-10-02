import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class BlogNotFoundException extends ExceptionFrom(
  CoreErrors.BLOG_NOT_FOUND,
) {}
