import {
  computeGiverAccuracy,
  GiverAccuracyReviewThreshold,
  MinGiverAccuracySamples,
} from './transaction-review';

describe('computeGiverAccuracy', () => {
  it('chưa đủ mẫu thì KHÔNG công bố chỉ số', () => {
    // Kết luận "người này mô tả sai 40%" từ một lần đánh giá là bôi nhọ chứ
    // không phải đo lường.
    for (let count = 0; count < MinGiverAccuracySamples; count += 1) {
      const snapshot = computeGiverAccuracy(Array<number>(count).fill(10));
      expect(snapshot.percent).toBeNull();
      expect(snapshot.samples).toBe(count);
      expect(snapshot.reviewRequired).toBe(false);
    }
  });

  it('đủ mẫu thì công bố trung bình đã làm tròn', () => {
    const snapshot = computeGiverAccuracy([90, 80, 100, 70, 85]);

    expect(snapshot.samples).toBe(5);
    expect(snapshot.percent).toBe(85);
  });

  it('làm tròn về số nguyên, không giữ thập phân', () => {
    // Hiện hai chữ số thập phân là gợi ý một độ chính xác mà chỉ số này
    // không có.
    const snapshot = computeGiverAccuracy([90, 90, 90, 90, 91]);

    expect(snapshot.percent).toBe(90);
    expect(Number.isInteger(snapshot.percent)).toBe(true);
  });

  it(`đúng ngưỡng ${GiverAccuracyReviewThreshold}% thì CHƯA vào diện xem xét`, () => {
    // Ngưỡng là "dưới 75%", không phải "từ 75% trở xuống".
    const snapshot = computeGiverAccuracy([75, 75, 75, 75, 75]);

    expect(snapshot.percent).toBe(GiverAccuracyReviewThreshold);
    expect(snapshot.reviewRequired).toBe(false);
  });

  it('dưới ngưỡng một điểm thì vào diện xem xét', () => {
    const snapshot = computeGiverAccuracy([74, 74, 74, 74, 74]);

    expect(snapshot.percent).toBe(74);
    expect(snapshot.reviewRequired).toBe(true);
  });

  it('điểm rất thấp nhưng CHƯA đủ mẫu thì vẫn không gắn cờ', () => {
    // Bốn lần chấm 0% chưa đủ để đưa một người lên bàn Admin.
    const snapshot = computeGiverAccuracy([0, 0, 0, 0]);

    expect(snapshot.percent).toBeNull();
    expect(snapshot.reviewRequired).toBe(false);
  });

  it('nhận đủ biên 0 và 100', () => {
    expect(computeGiverAccuracy([0, 0, 0, 0, 0]).percent).toBe(0);
    expect(computeGiverAccuracy([100, 100, 100, 100, 100]).percent).toBe(100);
    expect(computeGiverAccuracy([0, 0, 0, 0, 0]).reviewRequired).toBe(true);
    expect(computeGiverAccuracy([100, 100, 100, 100, 100]).reviewRequired).toBe(
      false,
    );
  });

  it('mẫu mới kéo chỉ số lên khỏi ngưỡng thì cờ tự tắt', () => {
    // Cờ phải theo dữ liệu hiện tại, không phải một lần bật rồi ở lại mãi.
    const before = computeGiverAccuracy([60, 60, 60, 60, 60]);
    expect(before.reviewRequired).toBe(true);

    const after = computeGiverAccuracy([60, 60, 60, 60, 60, 100, 100, 100]);
    expect(after.reviewRequired).toBe(false);
  });
});
