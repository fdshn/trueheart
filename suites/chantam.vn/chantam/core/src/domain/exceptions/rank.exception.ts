import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class RankTierUnavailableException extends ExceptionFrom(
  CoreErrors.RANK_TIER_UNAVAILABLE,
) {}
