import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class EntitlementPolicyUnavailableException extends ExceptionFrom(
  CoreErrors.ENTITLEMENT_POLICY_UNAVAILABLE,
) {}

export class EntitlementCapabilityUnknownException extends ExceptionFrom(
  CoreErrors.ENTITLEMENT_CAPABILITY_UNKNOWN,
) {}
