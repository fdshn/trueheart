import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class LeaderboardMonthClosedException extends ExceptionFrom(
  CoreErrors.LEADERBOARD_MONTH_CLOSED,
) {}

export class LeaderboardExclusionExistsException extends ExceptionFrom(
  CoreErrors.LEADERBOARD_EXCLUSION_EXISTS,
) {}

export class LeaderboardExclusionNotFoundException extends ExceptionFrom(
  CoreErrors.LEADERBOARD_EXCLUSION_NOT_FOUND,
) {}

export class LeaderboardBadgeNotFoundException extends ExceptionFrom(
  CoreErrors.LEADERBOARD_BADGE_NOT_FOUND,
) {}
