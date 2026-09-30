/** Khoá cấu hình giới hạn bán kính quét public cho khách chưa đăng nhập. */
export const DiscoveryMaxRadiusConfigKey = 'discovery.max_radius_meters';

/**
 * Bán kính TỐI THIỂU client được yêu cầu, và bán kính MẶC ĐỊNH khi client không
 * nói gì. Cả hai đơn vị mét.
 *
 * Tới 30/09 hai khoá này có dòng trong `system_configs` mà không ai đọc —
 * `minRadiusMeters` trả về hằng kỹ thuật `MinSearchRadiusMeters`, còn "mặc định"
 * thì không tồn tại: thiếu `radiusMeters` nghĩa là **không lọc bán kính gì cả**.
 *
 * Nên `discovery.default_radius_meters` không chỉ là một khoá chưa nối; nó là chỗ
 * đáng lẽ bịt một lỗ. Một client gửi toạ độ mà bỏ trống bán kính đang quét cả
 * nước, đúng thứ mà comment của `MaxSearchRadiusMeters` nói là phải chặn.
 */
export const DiscoveryMinRadiusConfigKey = 'discovery.min_radius_meters';
export const DiscoveryDefaultRadiusConfigKey =
  'discovery.default_radius_meters';

/**
 * Kẹp một bán kính cấu hình vào cận KỸ THUẬT.
 *
 * Cận kỹ thuật (`MinSearchRadiusMeters`, `MaxSearchRadiusMeters`) là bất biến của
 * tầng truy vấn: dưới sàn là để lộ vị trí quá chi tiết, trên trần là quét cả nước
 * làm sập database. Cấu hình của Admin không nới được chúng.
 *
 * Giá trị hỏng rơi về `fallback` chứ không ném: một ô cấu hình gõ sai không được
 * làm chết đường tìm bài.
 */
export function normalizeDiscoveryRadiusMeters(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
  fallback: number,
): number {
  const meters = Number(value);
  if (!Number.isInteger(meters) || meters <= 0) return fallback;

  return Math.min(limits.max, Math.max(limits.min, meters));
}

/** Hạn mức bán kính quét bài theo hạng, độc lập với bán kính hoạt động nhóm. */
export const DiscoveryRadiusCapabilityCode = 'DISCOVERY_RADIUS';

/**
 * Dữ liệu cấu hình do Admin nhập nên luôn phải fail-safe trước khi dùng.
 * Giá trị hỏng quay về trần kỹ thuật; giá trị ngoài khoảng được kẹp lại.
 */
export function normalizeGuestMaxRadiusMeters(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return limits.max;
  return Math.min(limits.max, Math.max(limits.min, value));
}
