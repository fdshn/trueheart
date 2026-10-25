import { IForumEngagementLeaderboardResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetDharmaLeaderboardCommand {
  /** `YYYY-MM`; bỏ trống = tháng hiện tại theo giờ Việt Nam. */
  month?: string;
  limit?: number;
}

export interface IGetForumEngagementLeaderboardUseCase extends IUseCase<
  IGetDharmaLeaderboardCommand,
  IForumEngagementLeaderboardResponseDto
> {}

export const IGetForumEngagementLeaderboardUseCase = Symbol(
  'IGetForumEngagementLeaderboardUseCase',
);
