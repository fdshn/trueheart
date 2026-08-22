/**
 * SRID 4326 = WGS 84 — hệ toạ độ mà GPS của điện thoại trả về.
 * Toàn hệ thống chỉ dùng một SRID duy nhất để không bao giờ phải quy đổi.
 */
export const Srid = 4326;

/** Toạ độ theo thứ tự người đọc quen: vĩ độ trước, kinh độ sau. */
export interface IGeoPoint {
  lat: number;
  lng: number;
}

/**
 * GeoJSON đảo ngược thứ tự: `[kinh độ, vĩ độ]`.
 * Đây là nguồn lỗi kinh điển — mọi chuyển đổi phải đi qua hai hàm dưới đây,
 * không tự viết inline.
 */
export interface IGeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export function toGeoJsonPoint(point: IGeoPoint): IGeoJsonPoint {
  return { type: 'Point', coordinates: [point.lng, point.lat] };
}

export function fromGeoJsonPoint(geoJson: IGeoJsonPoint): IGeoPoint {
  const [lng, lat] = geoJson.coordinates;

  return { lat, lng };
}

export function isValidGeoPoint(value: unknown): value is IGeoPoint {
  if (typeof value !== 'object' || value === null) return false;

  const { lat, lng } = value as Partial<IGeoPoint>;

  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
