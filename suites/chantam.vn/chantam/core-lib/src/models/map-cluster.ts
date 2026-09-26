/**
 * Số cột chia ngang khung nhìn.
 *
 * 16 cột cho ra ô đủ nhỏ để thấy được mật độ, mà không nhiều tới mức mỗi ô chỉ
 * có một bài — lúc đó gom cụm chẳng khác gì trả từng bài.
 */
const ViewportColumns = 16;

/**
 * Ô nhỏ nhất: 2^-14 độ, khoảng 6,8 mét ở xích đạo.
 *
 * Nhỏ hơn nữa là vô nghĩa: toạ độ bài đăng đã bị làm nhiễu trong bán kính hàng
 * trăm mét, nên gom theo ô 1 mét chỉ gom cái nhiễu.
 */
const MinStepDegrees = 2 ** -14;

/** Ô lớn nhất: 4 độ, khoảng 440 km — mức nhìn cả nước. */
const MaxStepDegrees = 4;

/**
 * Cỡ ô lưới gom cụm, tính từ bề ngang khung nhìn.
 *
 * **Vì sao lượng tử hoá về luỹ thừa của 2 thay vì chia đều khung nhìn.** Chia
 * đều thì mỗi lần người dùng kéo bản đồ một chút là lưới lệch đi một chút, và
 * các cụm nhảy chỗ liên tục dù không có bài nào đổi. Luỹ thừa của 2 neo lưới
 * vào một hệ toạ độ CỐ ĐỊNH: kéo ngang bao nhiêu thì cụm vẫn đứng yên, chỉ khi
 * phóng to/thu nhỏ qua một mức mới đổi cỡ ô.
 *
 * Trả về cỡ ô theo ĐỘ, dùng thẳng cho `ST_SnapToGrid`.
 */
export function mapClusterStepDegrees(
  minLng: number,
  maxLng: number,
  columns: number = ViewportColumns,
): number {
  const span = Math.abs(maxLng - minLng);

  // Khung nhìn suy biến (client gửi hai cạnh trùng nhau) thì lùi về ô nhỏ nhất
  // thay vì chia cho 0.
  if (!Number.isFinite(span) || span <= 0) return MinStepDegrees;

  const raw = span / Math.max(1, columns);
  const quantised = 2 ** Math.floor(Math.log2(raw));

  return Math.min(MaxStepDegrees, Math.max(MinStepDegrees, quantised));
}

export const MapClusterLimits = {
  minStepDegrees: MinStepDegrees,
  maxStepDegrees: MaxStepDegrees,
  viewportColumns: ViewportColumns,
} as const;
