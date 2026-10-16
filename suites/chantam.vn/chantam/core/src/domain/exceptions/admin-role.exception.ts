import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class LastSuperAdminException extends ExceptionFrom(
  CoreErrors.ADMIN_LAST_SUPER_ADMIN,
) {}

export class SelfRoleChangeException extends ExceptionFrom(
  CoreErrors.ADMIN_SELF_ROLE_CHANGE,
) {}

export class AdminRoleNotFoundException extends ExceptionFrom(
  CoreErrors.ADMIN_ROLE_NOT_FOUND,
) {}

export class AdminRoleCodeConflictException extends ExceptionFrom(
  CoreErrors.ADMIN_ROLE_CODE_CONFLICT,
) {}

export class AdminRoleProtectedException extends ExceptionFrom(
  CoreErrors.ADMIN_ROLE_PROTECTED,
) {}

export class AdminPermissionUnknownException extends ExceptionFrom(
  CoreErrors.ADMIN_PERMISSION_UNKNOWN,
) {}

export class AdminRoleSelfLockoutException extends ExceptionFrom(
  CoreErrors.ADMIN_ROLE_SELF_LOCKOUT,
) {}

export class NotificationTemplateNotFoundException extends ExceptionFrom(
  CoreErrors.NOTIFICATION_TEMPLATE_NOT_FOUND,
) {}
