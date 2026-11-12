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

/**
 * Lý do máy đọc được của trạng thái đang chờ / đã đóng (cột `gift_requests.status_reason`).
 * App tự dịch — không lưu câu chữ. CHECK ở migration `1803300000000` giữ đúng tập này.
 */
export enum GiftRequestStatusReasons {
  /** `STANDBY`: bài đã hết hàng. */
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  /** `STANDBY`: bài còn hàng nhưng ít hơn số người này xin — sửa số lượng hoặc chờ hoàn lại. */
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  /** `CANCELLED`: bài đã trao hết và hoàn tất, không còn bổ sung được. */
  POST_COMPLETED = 'POST_COMPLETED',
  /** `CANCELLED`: lượt trao sinh từ request này bị huỷ. */
  TRANSACTION_CANCELLED = 'TRANSACTION_CANCELLED',
}

/** Request ĐANG CHỜ — tối đa một mỗi (bài, người xin), ràng buộc ở database. */
export const OpenGiftRequestStatuses: readonly GiftRequestStatuses[] = [
  GiftRequestStatuses.PENDING,
  GiftRequestStatuses.STANDBY,
];
