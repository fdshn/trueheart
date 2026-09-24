import {
  DefaultPointRedemptionConfig,
  DefaultReviewGraceConfig,
  MaxReviewGraceDays,
  MaxVndPerPoint,
  normalizePointRedemptionConfig,
  normalizeReviewGraceConfig,
} from './point-economy';

describe('normalizePointRedemptionConfig', () => {
  it('giữ nguyên giá trị hợp lệ', () => {
    expect(normalizePointRedemptionConfig({ vndPerPoint: 3500 })).toEqual({
      vndPerPoint: 3500,
    });
  });

  it.each([null, undefined, 'x', 42, [], { vndPerPoint: 'nhiều' }])(
    'rơi về mặc định với đầu vào hỏng: %p',
    (raw) => {
      expect(normalizePointRedemptionConfig(raw)).toEqual(
        DefaultPointRedemptionConfig,
      );
    },
  );

  it('không bao giờ trả 0 — chia cho không làm mọi vật phẩm vô nghĩa', () => {
    expect(normalizePointRedemptionConfig({ vndPerPoint: 0 }).vndPerPoint).toBe(
      1,
    );
    expect(
      normalizePointRedemptionConfig({ vndPerPoint: -900 }).vndPerPoint,
    ).toBe(1);
  });

  it('kẹp ở trần trên', () => {
    expect(
      normalizePointRedemptionConfig({ vndPerPoint: 9e12 }).vndPerPoint,
    ).toBe(MaxVndPerPoint);
  });

  it('cắt phần thập phân thay vì làm tròn', () => {
    expect(
      normalizePointRedemptionConfig({ vndPerPoint: 2000.9 }).vndPerPoint,
    ).toBe(2000);
  });
});

describe('normalizeReviewGraceConfig', () => {
  it('giữ nguyên giá trị hợp lệ', () => {
    expect(
      normalizeReviewGraceConfig({ graceDays: 3, defaultAccuracyPercent: 90 }),
    ).toEqual({ graceDays: 3, defaultAccuracyPercent: 90 });
  });

  it.each([null, undefined, 'x', { graceDays: 'ba' }])(
    'rơi về mặc định với đầu vào hỏng: %p',
    (raw) => {
      expect(normalizeReviewGraceConfig(raw)).toEqual(DefaultReviewGraceConfig);
    },
  );

  it('cho phép 0 ngày — nghĩa là cộng điểm ngay, không chờ đánh giá', () => {
    expect(
      normalizeReviewGraceConfig({ graceDays: 0, defaultAccuracyPercent: 80 })
        .graceDays,
    ).toBe(0);
  });

  it('kẹp số ngày vào khoảng hợp lệ', () => {
    expect(
      normalizeReviewGraceConfig({ graceDays: -5, defaultAccuracyPercent: 80 })
        .graceDays,
    ).toBe(0);
    expect(
      normalizeReviewGraceConfig({
        graceDays: 9999,
        defaultAccuracyPercent: 80,
      }).graceDays,
    ).toBe(MaxReviewGraceDays);
  });

  it('kẹp phần trăm vào 0..100', () => {
    expect(
      normalizeReviewGraceConfig({ graceDays: 7, defaultAccuracyPercent: 140 })
        .defaultAccuracyPercent,
    ).toBe(100);
    expect(
      normalizeReviewGraceConfig({ graceDays: 7, defaultAccuracyPercent: -3 })
        .defaultAccuracyPercent,
    ).toBe(0);
  });

  it('mặc định 80% nằm TRÊN ngưỡng gắn cờ 75%', () => {
    // Một lượt không được đánh giá không bao giờ được tự nó kéo người tặng vào
    // diện Admin xem xét. Nếu ai đó hạ mặc định xuống dưới ngưỡng, test này
    // không chặn được — nhưng nó canh chính giá trị khởi tạo.
    expect(
      DefaultReviewGraceConfig.defaultAccuracyPercent,
    ).toBeGreaterThanOrEqual(75);
  });
});
