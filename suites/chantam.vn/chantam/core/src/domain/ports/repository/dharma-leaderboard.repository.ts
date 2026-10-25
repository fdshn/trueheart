import { IPublicAuthorSummaryDto } from '@chantam.vn/chantam.core-lib/dto';

/** Một dòng như repository tính ra — CÓ danh tính; use case quyết định có lộ hay không. */
export interface IForumEngagementRow {
  position: number;
  engagementCount: number;
  threadCount: number;
  isAnonymous: boolean;
  author: IPublicAuthorSummaryDto;
  topThread: { id: string; title: string; engagementCount: number };
}

/**
 * Bảng xếp hạng Phật Pháp (PR #46 §11), tính SỐNG từ bảng nguồn — không có snapshot như bảng
 * thành tích tháng, vì không có huy hiệu hay phần thưởng nào chốt theo nó.
 */
export interface IDharmaLeaderboardRepository {
  /**
   * Tác giả có chủ đề diễn đàn nhận nhiều tương tác nhất trong `[start, end)`.
   *
   * Đếm từ `content_comments`/`content_reactions` chứ không từ số đếm tổng của chủ đề: phải
   * loại tương tác của chính tác giả, và số tổng không tách được phần đó.
   */
  rankForumEngagement(params: {
    start: Date;
    end: Date;
    limit: number;
  }): Promise<IForumEngagementRow[]>;
}

export const IDharmaLeaderboardRepository = Symbol(
  'IDharmaLeaderboardRepository',
);
