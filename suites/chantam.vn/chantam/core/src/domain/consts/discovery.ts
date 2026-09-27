/** Khoá cấu hình giới hạn bán kính quét public cho khách chưa đăng nhập. */
export const DiscoveryMaxRadiusConfigKey = 'discovery.max_radius_meters';

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
