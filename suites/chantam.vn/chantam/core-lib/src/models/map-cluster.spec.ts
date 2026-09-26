import { MapClusterLimits, mapClusterStepDegrees } from './map-cluster';

describe('mapClusterStepDegrees', () => {
  it('khung nhìn càng rộng thì ô càng to', () => {
    const city = mapClusterStepDegrees(106.6, 106.8);
    const country = mapClusterStepDegrees(102, 110);

    expect(country).toBeGreaterThan(city);
  });

  it('KÉO NGANG không đổi cỡ ô — cụm không nhảy chỗ', () => {
    // Đây là toàn bộ lý do lượng tử hoá về luỹ thừa của 2. Chia đều khung nhìn
    // thì mỗi lần kéo một chút là lưới lệch một chút.
    const before = mapClusterStepDegrees(106.6, 106.8);
    const afterPan = mapClusterStepDegrees(106.65, 106.85);

    expect(afterPan).toBe(before);
  });

  it('luôn là một luỹ thừa của 2', () => {
    for (const span of [0.05, 0.2, 1, 3, 12]) {
      const step = mapClusterStepDegrees(100, 100 + span);

      expect(Number.isInteger(Math.log2(step))).toBe(true);
    }
  });

  it('không vượt trần và không xuống dưới sàn', () => {
    expect(mapClusterStepDegrees(0, 360)).toBe(MapClusterLimits.maxStepDegrees);
    expect(mapClusterStepDegrees(0, 0.000001)).toBe(
      MapClusterLimits.minStepDegrees,
    );
  });

  it('khung nhìn suy biến thì lùi về ô nhỏ nhất, không chia cho 0', () => {
    expect(mapClusterStepDegrees(106.7, 106.7)).toBe(
      MapClusterLimits.minStepDegrees,
    );
    expect(mapClusterStepDegrees(Number.NaN, 106.7)).toBe(
      MapClusterLimits.minStepDegrees,
    );
  });

  it('không phụ thuộc chiều gửi lên', () => {
    expect(mapClusterStepDegrees(106.8, 106.6)).toBe(
      mapClusterStepDegrees(106.6, 106.8),
    );
  });
});
