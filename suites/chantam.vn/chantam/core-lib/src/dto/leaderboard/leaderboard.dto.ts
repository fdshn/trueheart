import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';
import { LeaderboardBoards, UserRanks } from '../../consts';

export type LeaderboardStatus = 'LIVE' | 'CLOSED';

export interface ILeaderboardUserDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
}

/**
 * Một dòng trên bảng. KHÔNG có `userId`: dòng ẩn danh mà mang id thì id đó tra ngược ra
 * hồ sơ. Danh tính chỉ đi qua `user`, và `user` là `null` khi dòng không được lộ.
 */
export interface ILeaderboardEntryDto {
  rank: number;
  count: number;
  isAnonymous: boolean;
  /** Tài khoản bị khoá/xoá sau khi chốt — mobile hiện "Tài khoản không còn hoạt động". */
  isInactive: boolean;
  user: ILeaderboardUserDto | null;
}

export interface IMonthlyLeaderboardDto {
  /** `YYYY-MM` */
  month: string;
  board: LeaderboardBoards;
  status: LeaderboardStatus;
  enabled: boolean;
  closedAt: Date | null;
  entries: ILeaderboardEntryDto[];
  meta: IPaginationMetaDto;
  /** Dòng của người gọi (kèm token), đủ danh tính của CHÍNH họ; `null` khi chưa lên bảng. */
  me: ILeaderboardEntryDto | null;
}

export interface IMyLeaderboardPositionDto {
  board: LeaderboardBoards;
  /** `null` khi chưa đủ sàn hoặc bị loại. */
  rank: number | null;
  count: number;
  minCount: number;
  badgeRanks: number;
  /** Còn thiếu bao nhiêu để bằng hạng cuối nhận huy hiệu; `null` khi đã trong nhóm đó. */
  gapToBadge: number | null;
  /** Còn thiếu bao nhiêu để bằng người ngay trên; `null` khi đứng đầu. */
  gapToNext: number | null;
}

export interface IMyLeaderboardPositionsDto {
  /** `YYYY-MM` */
  month: string;
  status: LeaderboardStatus;
  enabled: boolean;
  positions: IMyLeaderboardPositionDto[];
}

export interface ILeaderboardMonthsDto {
  /** Tháng đã chốt, `YYYY-MM`, mới nhất trước. */
  months: string[];
}
