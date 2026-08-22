import { applyGeoJitter, DefaultJitterRadiusMeters } from './geo-jitter';

const origin = { lat: 10.7769, lng: 106.7009 };

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadius = 6_371_000;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

describe('applyGeoJitter', () => {
  it('trả về cùng một kết quả cho cùng một seed', () => {
    const first = applyGeoJitter(origin, 'gift-post-1');
    const second = applyGeoJitter(origin, 'gift-post-1');

    expect(first).toEqual(second);
  });

  it('trả về kết quả khác nhau cho seed khác nhau', () => {
    const first = applyGeoJitter(origin, 'gift-post-1');
    const second = applyGeoJitter(origin, 'gift-post-2');

    expect(first).not.toEqual(second);
  });

  it('không bao giờ dịch quá bán kính cho phép', () => {
    for (let index = 0; index < 500; index += 1) {
      const jittered = applyGeoJitter(origin, `gift-post-${index}`);

      expect(distanceMeters(origin, jittered)).toBeLessThanOrEqual(
        DefaultJitterRadiusMeters + 1,
      );
    }
  });

  it('luôn dịch đi một khoảng thật sự (không trả về chính điểm gốc)', () => {
    const jittered = applyGeoJitter(origin, 'gift-post-1');

    expect(distanceMeters(origin, jittered)).toBeGreaterThan(0);
  });
});
