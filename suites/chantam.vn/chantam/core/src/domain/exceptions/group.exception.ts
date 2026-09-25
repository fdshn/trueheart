import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GroupDefaultLocationRequiredException extends ExceptionFrom(
  CoreErrors.GROUP_DEFAULT_LOCATION_REQUIRED,
) {}

export class GroupAlreadyMemberException extends ExceptionFrom(
  CoreErrors.GROUP_ALREADY_MEMBER,
) {}

export class GroupCreateNotAllowedException extends ExceptionFrom(
  CoreErrors.GROUP_CREATE_NOT_ALLOWED,
) {}

export class GroupInviteInvalidException extends ExceptionFrom(
  CoreErrors.GROUP_INVITE_INVALID,
) {}

export class GroupNotFoundException extends ExceptionFrom(
  CoreErrors.GROUP_NOT_FOUND,
) {}
