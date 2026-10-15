import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class HomeCampaignNotFoundException extends ExceptionFrom(
  CoreErrors.HOME_CAMPAIGN_NOT_FOUND,
) {}

export class HomeCampaignScheduleConflictException extends ExceptionFrom(
  CoreErrors.HOME_CAMPAIGN_SCHEDULE_CONFLICT,
) {}
