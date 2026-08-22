/** Trạng thái không cho phép chỉnh sửa nội dung bài đăng nữa. */
export const ClosedGiftPostStatuses = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'ARCHIVED',
] as const;

/** Thời hạn bài đăng không có người nhận trước khi hết hạn (đặc tả mục 3.2). */
export const GiftPostExpiryDays = 30;
