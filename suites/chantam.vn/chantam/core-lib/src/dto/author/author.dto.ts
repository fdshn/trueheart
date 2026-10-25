import { UserRanks } from '../../consts';

/**
 * Tác giả hiển thị công khai, dùng CHUNG cho bài đăng, bình luận và Diễn đàn (PR #46 §3.4).
 *
 * `fullName` công khai từ 25/10/2026 — chủ dự án đảo CHỐT-11. Email, SĐT, vị trí mặc định
 * KHÔNG BAO GIỜ nằm ở đây; liên hệ công khai đi qua `contacts` của hồ sơ theo cài đặt riêng.
 */
export interface IPublicAuthorSummaryDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
}
