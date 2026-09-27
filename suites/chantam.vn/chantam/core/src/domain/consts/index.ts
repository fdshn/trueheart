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
 * Trọng số gợi ý Smart Match (F17 — Phase 1 thuần luật, không học máy).
 *
 * Ba trọng số cộng lại đúng bằng 1 nên điểm luôn nằm trong [0, 1] và đọc được
 * như phần trăm độ khớp. Cùng danh mục nặng nhất vì đó là tín hiệu người dùng
 * chủ động khai báo; khoảng cách nhẹ nhất vì nó đã là điều kiện lọc rồi, để
 * nặng nữa thì một bài sát vách nhưng sai danh mục lại chen lên đầu.
 */
export const SmartMatchWeights = {
  sameCategory: 0.5,
  keyword: 0.3,
  proximity: 0.2,
} as const;

/** Bán kính gợi ý mặc định khi client không nêu. */
export const SmartMatchDefaultRadiusMeters = 20_000;

/** Số gợi ý tối đa cho một lần gọi. */
export const SmartMatchMaxResults = 20;

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
