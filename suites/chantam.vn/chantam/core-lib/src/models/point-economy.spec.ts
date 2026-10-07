import {
  computeGiftValueBonus,
  DefaultGiftValueBonusMaxValueVnd,
  DefaultPointRedemptionConfig,
  DefaultReviewGraceConfig,
  MaxReviewGraceDays,
  MaxVndPerPoint,
  normalizePointRedemptionConfig,
  normalizeReviewGraceConfig,
  quoteRedemption,
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

describe('quoteRedemption', () => {
  it('quy giá ra điểm theo tỷ lệ', () => {
    expect(quoteRedemption(1_000_000, { vndPerPoint: 2000 })).toEqual({
      redeemable: true,
      points: 500,
      reason: null,
    });
  });

  it('làm tròn LÊN, không xuống', () => {
    // Làm tròn xuống là bán món đồ rẻ hơn giá người tặng khai, và chênh lệch đó
    // nhân với số lượt đổi là một khoản thất thoát không ai theo dõi.
    expect(quoteRedemption(1500, { vndPerPoint: 1000 }).points).toBe(2);
    expect(quoteRedemption(1001, { vndPerPoint: 1000 }).points).toBe(2);
    expect(quoteRedemption(1000, { vndPerPoint: 1000 }).points).toBe(1);
  });

  it.each([null, undefined, 0, -5, Number.NaN, 'rác'])(
    'không khai giá thì KHÔNG đổi được: %p',
    (value) => {
      expect(quoteRedemption(value as never)).toEqual({
        redeemable: false,
        points: 0,
        reason: 'NO_ESTIMATED_VALUE',
      });
    },
  );

  it('giá trị rỗng KHÔNG có nghĩa là cho không', () => {
    // Đây là chỗ dễ sai nhất: coi "không khai giá" là 0 điểm thì mọi bài không
    // điền giá trở thành đổi miễn phí.
    expect(quoteRedemption(null).redeemable).toBe(false);
  });

  it('dùng tỷ lệ mặc định khi không truyền', () => {
    expect(quoteRedemption(1_000_000).points).toBe(500);
  });
});

describe('computeGiftValueBonus (CHỐT-14)', () => {
  const Base = {
    vndPerPoint: 2_000,
    maxValueVnd: DefaultGiftValueBonusMaxValueVnd,
  };

  it('áp đúng công thức hai lượt làm tròn của đặc tả', () => {
    // 1.000.000 / 2.000 = 500 điểm trần; 500 × 90% = 450.
    expect(
      computeGiftValueBonus({
        ...Base,
        estimatedValueVnd: 1_000_000,
        accuracyPercent: 90,
      }),
    ).toEqual({ points: 450, appliedValueVnd: 1_000_000, capped: false });
  });

  it('làm tròn nửa LÊN, không xuống', () => {
    // 2.000 / 2.000 = 1 điểm; 1 × 50% = 0,5 -> 1.
    expect(
      computeGiftValueBonus({
        ...Base,
        estimatedValueVnd: 2_000,
        accuracyPercent: 50,
      }).points,
    ).toBe(1);
  });

  it('CHẶN lỗ in điểm: giá khai trần bị cắt về trần cấu hình', () => {
    // Đây là lý do hàm này có tham số `maxValueVnd`. Không trần thì
    // 1.000.000.000 / 2.000 = 500.000 điểm trong MỘT lượt trao — 279 lần ngưỡng
    // Kim Cương (1.792). Hai người thông đồng in điểm không giới hạn.
    const result = computeGiftValueBonus({
      ...Base,
      estimatedValueVnd: 1_000_000_000,
      accuracyPercent: 100,
    });

    expect(result.capped).toBe(true);
    expect(result.appliedValueVnd).toBe(DefaultGiftValueBonusMaxValueVnd);
    // 2.000.000 / 2.000 = 1.000 điểm, dưới ngưỡng Kim Cương.
    expect(result.points).toBe(1_000);
    expect(result.points).toBeLessThan(1_792);
  });

  it.each([
    ['không khai giá', null],
    ['giá 0', 0],
    ['giá âm', -5_000_000],
  ])('không có bonus khi %s', (_label, value) => {
    expect(
      computeGiftValueBonus({
        ...Base,
        estimatedValueVnd: value,
        accuracyPercent: 100,
      }).points,
    ).toBe(0);
  });

  it('chấm 0% thì bonus 0, nhưng vẫn báo giá đã dùng', () => {
    const result = computeGiftValueBonus({
      ...Base,
      estimatedValueVnd: 1_000_000,
      accuracyPercent: 0,
    });

    expect(result.points).toBe(0);
    expect(result.appliedValueVnd).toBe(1_000_000);
  });

  it.each([0, -1, Number.NaN])(
    'tỷ lệ VNĐ/điểm hỏng (%p) trả 0 chứ KHÔNG ném',
    (rate) => {
      // Job đối soát chạy qua hàng trăm lượt trao; một cấu hình hỏng không được
      // làm nó dừng giữa danh sách.
      expect(() =>
        computeGiftValueBonus({
          estimatedValueVnd: 1_000_000,
          accuracyPercent: 100,
          vndPerPoint: rate,
          maxValueVnd: DefaultGiftValueBonusMaxValueVnd,
        }),
      ).not.toThrow();
      expect(
        computeGiftValueBonus({
          estimatedValueVnd: 1_000_000,
          accuracyPercent: 100,
          vndPerPoint: rate,
          maxValueVnd: DefaultGiftValueBonusMaxValueVnd,
        }).points,
      ).toBe(0);
    },
  );

  it('accuracy ngoài khoảng 0-100 bị kẹp, không nhân vượt', () => {
    expect(
      computeGiftValueBonus({
        ...Base,
        estimatedValueVnd: 1_000_000,
        accuracyPercent: 500,
      }).points,
    ).toBe(500);
  });

  it('trần 0 nghĩa là TẮT hẳn bonus theo giá trị', () => {
    expect(
      computeGiftValueBonus({
        vndPerPoint: 2_000,
        maxValueVnd: 0,
        estimatedValueVnd: 1_000_000,
        accuracyPercent: 100,
      }).points,
    ).toBe(0);
  });
});
