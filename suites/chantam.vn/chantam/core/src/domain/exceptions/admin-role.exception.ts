import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class LastSuperAdminException extends ExceptionFrom(
  CoreErrors.ADMIN_LAST_SUPER_ADMIN,
) {}

export class SelfRoleChangeException extends ExceptionFrom(
  CoreErrors.ADMIN_SELF_ROLE_CHANGE,
) {}
