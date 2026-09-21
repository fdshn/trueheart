/** Trạng thái của một yêu cầu xin nhận đồ (FSM Module 5 / Bảng 6.2.5). */
export enum GiftRequestStatuses {
  /** Đang chờ người cho xem xét và đưa ra quyết định. */
  PENDING = 'PENDING',
  /** Đã được người cho chấp thuận và kích hoạt giao dịch. */
  ACCEPTED = 'ACCEPTED',
  /** Người cho đã từ chối hoặc chọn ứng viên khác. */
  REJECTED = 'REJECTED',
  /** Giao dịch bị huỷ hoặc bài đăng bị gỡ. */
  CANCELLED = 'CANCELLED',
  /** Người xin chủ động rút yêu cầu. */
  WITHDRAWN = 'WITHDRAWN',
  /** Đứng trong hàng đợi chờ xét tiếp nếu người trước huỷ. */
  STANDBY = 'STANDBY',
}
