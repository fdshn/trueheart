import { IPublicAuthorSummaryDto } from '../author';

/** Chu kỳ của bảng xếp hạng Phật Pháp. Hiện chỉ có tháng (giờ Việt Nam). */
export enum DharmaLeaderboardPeriods {
  MONTH = 'MONTH',
}

export interface IDharmaLeaderboardQueryDto {
  period?: DharmaLeaderboardPeriods;
  /** `YYYY-MM`; bỏ trống = tháng hiện tại theo giờ Việt Nam. */
  month?: string;
  limit?: number;
}

/**
 * Một dòng bảng — KHÔNG có `userId` (PR #46 §11). Người bật ẩn danh trên bảng thành tích thì
 * `author` và `topThread` đều `null`: tiêu đề chủ đề dẫn thẳng về người viết.
 */
export interface IForumEngagementEntryDto {
  position: number;
  isAnonymous: boolean;
  author: IPublicAuthorSummaryDto | null;
  /** Cảm xúc + bình luận (kể cả trả lời) người KHÁC để lại trong tháng. */
  engagementCount: number;
  /** Số chủ đề của người này nhận được ít nhất một tương tác được tính. */
  threadCount: number;
  topThread: { id: string; title: string; engagementCount: number } | null;
}

export interface IForumEngagementLeaderboardDto {
  period: DharmaLeaderboardPeriods;
  /** `YYYY-MM` */
  month: string;
  entries: IForumEngagementEntryDto[];
}

export interface IForumEngagementLeaderboardResponseDto {
  leaderboard: IForumEngagementLeaderboardDto;
}

/**
 * Luật tính thời gian tụng (PR #46 §11): chỉ thời lượng server đo, mỗi phiên tính tối đa 2
 * giờ, phiên dưới 60 giây bỏ qua, và các phiên CHỒNG NHAU của cùng một người được gộp — mở ba
 * phiên song song không thành ba lần thời gian.
 */
export const RecitationSessionCapSeconds = 2 * 60 * 60;
export const RecitationMinimumSeconds = 60;

export interface IRecitationTimeEntryDto {
  position: number;
  isAnonymous: boolean;
  /** `null` khi người này bật ẩn danh trên bảng thành tích. */
  user: IPublicAuthorSummaryDto | null;
  /** Tổng giây đã gộp phiên chồng và cắt trần. */
  totalSeconds: number;
  /** Số phiên hoàn thành được tính trong tháng. */
  sessionCount: number;
}

export interface IRecitationTimeLeaderboardDto {
  period: DharmaLeaderboardPeriods;
  /** `YYYY-MM` */
  month: string;
  entries: IRecitationTimeEntryDto[];
}

export interface IRecitationTimeLeaderboardResponseDto {
  leaderboard: IRecitationTimeLeaderboardDto;
}
