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
