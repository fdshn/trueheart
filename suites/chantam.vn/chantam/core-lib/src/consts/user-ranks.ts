/**
 * Năm bậc thứ hạng (F12).
 *
 * Tên hiển thị tiếng Việt: Viewer · Thành viên · Bạc · Vàng · Kim Cương.
 * Enum dùng ASCII theo quy ước chung của repo.
 */
export enum UserRanks {
  VIEWER = 'VIEWER',
  MEMBER = 'MEMBER',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  DIAMOND = 'DIAMOND',
}

/**
 * Ngưỡng điểm để đạt từng bậc.
 *
 * Giá trị lấy từ bảng ngưỡng của Bên A. Lưu ý bước Bạc → Vàng (224) chỉ bằng
 * một nửa bước Thành viên → Bạc (448) — đường cong không đơn điệu tăng. Đã báo
 * Bên A, chưa có phản hồi; xem docs/FEATURES.md mục F12.
 *
 * Đây chỉ là giá trị khởi tạo. Từ M4 trở đi ngưỡng do Admin cấu hình.
 */
export const RankThresholds: Readonly<Record<UserRanks, number>> = {
  [UserRanks.VIEWER]: 0,
  [UserRanks.MEMBER]: 224,
  [UserRanks.SILVER]: 672,
  [UserRanks.GOLD]: 896,
  [UserRanks.DIAMOND]: 1792,
};

/** Thứ tự từ thấp lên cao. Dùng khi so sánh quyền theo bậc. */
export const RankOrder: readonly UserRanks[] = [
  UserRanks.VIEWER,
  UserRanks.MEMBER,
  UserRanks.SILVER,
  UserRanks.GOLD,
  UserRanks.DIAMOND,
];

/** `true` nếu `rank` bằng hoặc cao hơn `minimum`. */
export function hasRankAtLeast(rank: UserRanks, minimum: UserRanks): boolean {
  return RankOrder.indexOf(rank) >= RankOrder.indexOf(minimum);
}
