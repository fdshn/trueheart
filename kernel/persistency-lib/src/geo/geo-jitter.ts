import { IGeoPoint } from './geo-point';

/**
 * Bán kính làm nhiễu mặc định (mét).
 *
 * 300m đủ để che nhà cụ thể nhưng vẫn giữ đúng khu phố — người xem vẫn đánh giá
 * được "có gần mình không", đúng mục tiêu sản phẩm.
 */
export const DefaultJitterRadiusMeters = 300;

/** Số mét trên một độ vĩ độ (xấp xỉ, đủ chính xác ở quy mô vài trăm mét). */
const MetersPerLatitudeDegree = 111_320;

/** Băm chuỗi thành số nguyên 32-bit (FNV-1a). Không dùng cho mục đích mật mã. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** Sinh số giả ngẫu nhiên [0,1) tất định từ một state 32-bit (xorshift32). */
function nextRandom(state: number): { value: number; state: number } {
  let next = state;
  next ^= next << 13;
  next >>>= 0;
  next ^= next >> 17;
  next ^= next << 5;
  next >>>= 0;

  return { value: next / 0x1_0000_0000, state: next };
}

/**
 * Làm nhiễu toạ độ để che vị trí thật của người cho.
 *
 * Mục 1.3 đặc tả: chỉ người đã được duyệt nhận mới biết địa chỉ chính xác. Nhưng
 * bản đồ vẫn phải hiển thị pin cho người xem. Hàm này dung hoà hai yêu cầu đó.
 *
 * **Vì sao phải tất định theo `seed`:** nếu nhiễu ngẫu nhiên mỗi lần gọi, kẻ tấn
 * công chỉ cần gọi API vài chục lần rồi lấy tâm của cụm điểm là suy ra vị trí
 * thật. Truyền `globalId` của bài đăng làm seed để một bài luôn nhiễu về đúng
 * một điểm cố định.
 *
 * @param seed định danh ổn định của bản ghi — dùng `globalId`
 */
/**
 * Bước làm tròn khoảng cách công khai (mét).
 *
 * Trả khoảng cách chính xác tới mét sẽ vô hiệu hoá toàn bộ việc làm nhiễu toạ
 * độ: kẻ tấn công chỉ cần truy vấn từ ba điểm khác nhau rồi giải tam giác là ra
 * vị trí thật. Làm tròn thô khiến phép giải tam giác chỉ cho ra một vùng, không
 * cho ra một điểm.
 */
export const PublicDistanceBucketMeters = 100;

/** Làm tròn khoảng cách trước khi trả ra kênh công khai. */
export function bucketDistance(
  distanceMeters: number,
  bucketMeters: number = PublicDistanceBucketMeters,
): number {
  return Math.round(distanceMeters / bucketMeters) * bucketMeters;
}

export function applyGeoJitter(
  point: IGeoPoint,
  seed: string,
  radiusMeters: number = DefaultJitterRadiusMeters,
): IGeoPoint {
  const bearingRandom = nextRandom(hashSeed(seed));
  const distanceRandom = nextRandom(bearingRandom.state);

  const bearing = bearingRandom.value * 2 * Math.PI;
  // Căn bậc hai để điểm phân bố đều trên hình tròn thay vì dồn về tâm.
  const distance = Math.sqrt(distanceRandom.value) * radiusMeters;

  const deltaLat = (distance * Math.cos(bearing)) / MetersPerLatitudeDegree;

  // Một độ kinh độ ngắn dần khi tiến về hai cực.
  const metersPerLongitudeDegree =
    MetersPerLatitudeDegree * Math.cos((point.lat * Math.PI) / 180);
  const deltaLng =
    metersPerLongitudeDegree === 0
      ? 0
      : (distance * Math.sin(bearing)) / metersPerLongitudeDegree;

  return { lat: point.lat + deltaLat, lng: point.lng + deltaLng };
}
