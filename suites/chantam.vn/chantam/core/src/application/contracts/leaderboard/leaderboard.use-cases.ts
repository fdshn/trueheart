import { LeaderboardBoards } from '@chantam.vn/chantam.core-lib/consts';
import {
  ILeaderboardMonthsDto,
  IMonthlyLeaderboardDto,
  IMyLeaderboardPositionsDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

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
