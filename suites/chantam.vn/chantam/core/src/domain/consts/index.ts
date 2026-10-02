/** Trạng thái không cho phép chỉnh sửa nội dung bài đăng nữa. */
export const ClosedGiftPostStatuses = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'ARCHIVED',
] as const;

export * from './discovery';

/** Thời hạn bài đăng không có người nhận trước khi hết hạn (đặc tả mục 3.2). */
export const GiftPostExpiryDays = 30;

/**
 * Ba trọng số gợi ý Smart Match ĐÃ CHUYỂN sang `allocation.policy`.
 *
 * Tới 02/10 chúng là `SmartMatchWeights` ở đúng chỗ này, và không có đường nào để
 * Admin đổi. Nay nguồn duy nhất là `DefaultAllocationPolicy.weights` trong
 * `core-lib/src/models/allocation.ts`, đổi bằng `PUT /admin/config/allocation-policy`.
 *
 * Không để lại hằng số ở đây: hai bản của cùng ba con số thì sớm muộn lệch nhau, và
 * bản không ai đọc mới là bản người đọc mã nguồn tin.
 */

/** Bán kính gợi ý mặc định khi client không nêu. */
export const SmartMatchDefaultRadiusMeters = 20_000;

/**
 * Số gợi ý tối đa ĐÃ CHUYỂN sang `allocation.policy` (`maxSuggestions`).
 *
 * Trần kỹ thuật tuyệt đối còn lại là `MaxAllocationSuggestions` = 100, bằng đúng
 * kích cỡ rổ ứng viên `SmartMatchCandidateLimit` mà truy vấn kéo về.
 */

/**
 * Từ quá phổ biến thì bỏ khỏi truy vấn từ khoá.
 *
 * Danh sách cố tình ngắn: cắt nhầm một từ có nghĩa ("bé", "cũ") làm hỏng gợi ý
 * nặng hơn là để lọt vài từ nối.
 */
export const SmartMatchStopWords: readonly string[] = [
  'và',
  'các',
  'của',
  'cho',
  'những',
  'một',
  'là',
  'có',
  'với',
  'này',
  'đó',
];
