import { LeaderboardBoards } from '@chantam.vn/chantam.core-lib/consts';
import {
  IAdminBadgeDto,
  IAdminMonthlyLeaderboardDto,
  ILeaderboardExclusionDto,
  ILeaderboardMonthsDto,
  IListOwnBadgesResponseDto,
  IMonthlyLeaderboardDto,
  IMyLeaderboardPositionsDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IGetMonthlyLeaderboardCommand {
  viewerId: string | null;
  board: LeaderboardBoards;
  /** `YYYY-MM`; bỏ trống = tháng hiện tại theo giờ Việt Nam. */
  month?: string;
  page?: number;
  pageSize?: number;
}

export interface IGetMonthlyLeaderboardUseCase extends IUseCase<
  IGetMonthlyLeaderboardCommand,
  IMonthlyLeaderboardDto
> {}

export const IGetMonthlyLeaderboardUseCase = Symbol(
  'IGetMonthlyLeaderboardUseCase',
);

export interface IGetMyLeaderboardPositionsCommand {
  userId: string;
  month?: string;
}

export interface IGetMyLeaderboardPositionsUseCase extends IUseCase<
  IGetMyLeaderboardPositionsCommand,
  IMyLeaderboardPositionsDto
> {}

export const IGetMyLeaderboardPositionsUseCase = Symbol(
  'IGetMyLeaderboardPositionsUseCase',
);

export interface IListLeaderboardMonthsUseCase extends IUseCase<
  Record<string, never>,
  ILeaderboardMonthsDto
> {}

export const IListLeaderboardMonthsUseCase = Symbol(
  'IListLeaderboardMonthsUseCase',
);

/** Đồng hồ tiêm được — ranh giới tháng là thứ phải kiểm bằng một thời điểm cố định. */
export const LeaderboardClock = Symbol('LeaderboardClock');
export type LeaderboardClockFn = () => Date;

export interface ICloseLeaderboardMonthCommand {
  /** `YYYY-MM`; bỏ trống = tháng TRƯỚC tháng hiện tại theo giờ Việt Nam. */
  month?: string;
  /** Chỉ để kiểm thử và chạy bù có chủ đích; mặc định là bây giờ. */
  now?: Date;
}

export interface ICloseLeaderboardMonthResult {
  /** `YYYY-MM` */
  month: string;
  boards: {
    board: LeaderboardBoards;
    created: boolean;
    entries: number;
    badges: number;
  }[];
}

export interface ICloseLeaderboardMonthUseCase extends IUseCase<
  ICloseLeaderboardMonthCommand,
  ICloseLeaderboardMonthResult
> {}

export const ICloseLeaderboardMonthUseCase = Symbol(
  'ICloseLeaderboardMonthUseCase',
);

export interface IListOwnBadgesCommand {
  userId: string;
}

export interface IListOwnBadgesUseCase extends IUseCase<
  IListOwnBadgesCommand,
  IListOwnBadgesResponseDto
> {}

export const IListOwnBadgesUseCase = Symbol('IListOwnBadgesUseCase');

export interface IGetAdminMonthlyLeaderboardCommand {
  board: LeaderboardBoards;
  month?: string;
  page?: number;
  pageSize?: number;
}

export interface IGetAdminMonthlyLeaderboardUseCase extends IUseCase<
  IGetAdminMonthlyLeaderboardCommand,
  IAdminMonthlyLeaderboardDto
> {}

export const IGetAdminMonthlyLeaderboardUseCase = Symbol(
  'IGetAdminMonthlyLeaderboardUseCase',
);

export interface IListLeaderboardExclusionsCommand {
  month?: string;
  board?: LeaderboardBoards;
  page?: number;
  pageSize?: number;
}

export interface IListLeaderboardExclusionsUseCase extends IUseCase<
  IListLeaderboardExclusionsCommand,
  { items: ILeaderboardExclusionDto[]; meta: IPaginationMetaDto }
> {}

export const IListLeaderboardExclusionsUseCase = Symbol(
  'IListLeaderboardExclusionsUseCase',
);

export interface ICreateLeaderboardExclusionCommand {
  actorUserId: string;
  /** `YYYY-MM` */
  month: string;
  /** `null` = mọi bảng. */
  board: LeaderboardBoards | null;
  userId: string;
  reason: string;
}

export interface ICreateLeaderboardExclusionUseCase extends IUseCase<
  ICreateLeaderboardExclusionCommand,
  { exclusion: ILeaderboardExclusionDto }
> {}

export const ICreateLeaderboardExclusionUseCase = Symbol(
  'ICreateLeaderboardExclusionUseCase',
);

export interface IRemoveLeaderboardExclusionCommand {
  actorUserId: string;
  exclusionId: string;
}

export interface IRemoveLeaderboardExclusionUseCase extends IUseCase<
  IRemoveLeaderboardExclusionCommand,
  { exclusion: ILeaderboardExclusionDto }
> {}

export const IRemoveLeaderboardExclusionUseCase = Symbol(
  'IRemoveLeaderboardExclusionUseCase',
);

export interface IListAdminBadgesCommand {
  month?: string;
  board?: LeaderboardBoards;
  userId?: string;
  page?: number;
  pageSize?: number;
}

export interface IListAdminBadgesUseCase extends IUseCase<
  IListAdminBadgesCommand,
  { items: IAdminBadgeDto[]; meta: IPaginationMetaDto }
> {}

export const IListAdminBadgesUseCase = Symbol('IListAdminBadgesUseCase');

export interface IRevokeLeaderboardBadgeCommand {
  actorUserId: string;
  badgeId: string;
  reason: string;
}

export interface IRevokeLeaderboardBadgeUseCase extends IUseCase<
  IRevokeLeaderboardBadgeCommand,
  { badge: IAdminBadgeDto }
> {}

export const IRevokeLeaderboardBadgeUseCase = Symbol(
  'IRevokeLeaderboardBadgeUseCase',
);
