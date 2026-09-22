/**
 * Chế độ tìm người nhận khi đăng bài Muốn Tặng (OFFER).
 *
 * Người cho chọn một trong ba chế độ khi tạo bài:
 * - INSTANT  — Người đầu tiên gửi yêu cầu hợp lệ được chọn ngay lập tức.
 * - OPTIMAL  — Hệ thống chờ tối đa 7 ngày (từ request đầu tiên) để chọn
 *              người nhận tối ưu; cơ chế đổi điểm (UC-TRANS-06) vẫn hoạt động.
 * - EXTENDED — Hệ thống chờ tối đa 30 ngày (từ request đầu tiên); phù hợp
 *              với vật phẩm giá trị cao hoặc cần xem xét kỹ hơn.
 */
export enum PostSelectionModes {
  INSTANT = 'INSTANT',
  OPTIMAL = 'OPTIMAL',
  EXTENDED = 'EXTENDED',
}
