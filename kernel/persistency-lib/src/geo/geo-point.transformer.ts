import { ValueTransformer } from 'typeorm';
import {
  fromGeoJsonPoint,
  IGeoJsonPoint,
  IGeoPoint,
  toGeoJsonPoint,
} from './geo-point';

/**
 * Cầu nối giữa `IGeoPoint` của tầng domain và kiểu `geography(Point,4326)` của
 * PostGIS.
 *
 * TypeORM đã tự bọc tham số bằng `ST_GeomFromGeoJSON(...)` khi ghi và tự
 * `ST_AsGeoJSON(...)` khi đọc cột spatial, nên transformer chỉ cần lo phần đổi
 * thứ tự lat/lng giữa hai định dạng.
 */
export const GeoPointTransformer: ValueTransformer = {
  to(value?: IGeoPoint | null): IGeoJsonPoint | null | undefined {
    if (value === null || value === undefined) return value;

    return toGeoJsonPoint(value);
  },

  from(value?: IGeoJsonPoint | string | null): IGeoPoint | null | undefined {
    if (value === null || value === undefined) return value;

    // Driver có thể trả về chuỗi JSON tuỳ đường dẫn truy vấn — chuẩn hoá cả hai.
    const geoJson: IGeoJsonPoint =
      typeof value === 'string' ? (JSON.parse(value) as IGeoJsonPoint) : value;

    return fromGeoJsonPoint(geoJson);
  },
};
