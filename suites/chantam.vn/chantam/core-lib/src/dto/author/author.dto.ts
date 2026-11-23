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

/**
 * Hồ sơ công khai rút gọn của một người dùng (CR 22/11/2026): người tổ chức chiến dịch và danh
 * sách thành viên công khai. Đúng năm trường — không email, SĐT, vị trí.
 * `displayName` = họ tên, trống thì `username`.
 */
export interface IPublicUserProfileDto {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rank: UserRanks;
}
