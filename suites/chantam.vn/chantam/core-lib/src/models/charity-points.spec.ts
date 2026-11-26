import {
  CharityPointBaseRuleCodes,
  CharityPointBonusPercents,
  CharityPointCapConfigKeys,
  CharityPointRuleCodes,
  allowedUnderCaps,
  bonusAdjustmentTarget,
  bonusPoints,
  charityPointCapConfigKey,
  isCharityPointBonusPercent,
  isValidAppealValue,
  itemValuePoints,
  normalizeNonNegativeInt,
  participationPoints,
  postMediaPoints,
} from './charity-points';

describe('tính điểm', () => {
  it('giá trị vật phẩm: 1 điểm / 10.000đ, phần lẻ bỏ', () => {
    expect(itemValuePoints(125_000, 1)).toBe(12);
    expect(itemValuePoints(9_999, 1)).toBe(0);
    expect(itemValuePoints(100_000, 0)).toBe(0);
  });

  it('ảnh/clip: mức rule × số tệp, không hệ số theo vai', () => {
    expect(postMediaPoints({ mediaCount: 3, rulePoints: 3 })).toBe(9);
    expect(postMediaPoints({ mediaCount: 0, rulePoints: 3 })).toBe(0);
    expect(postMediaPoints({ mediaCount: 2, rulePoints: 0 })).toBe(0);
  });

  it('tham gia: 100 × mức hoàn thành / 100', () => {
    expect(participationPoints(85, 100)).toBe(85);
    expect(participationPoints(0, 100)).toBe(0);
    expect(participationPoints(33, 10)).toBe(3);
  });
});

describe('allowedUnderCaps', () => {
  it('lấy trần chặt nhất; không trần thì ghi đủ; vượt thì 0 (hoãn)', () => {
    expect(
      allowedUnderCaps(50, [
        { cap: 100, used: 70 },
        { cap: null, used: 999 },
        { cap: 40, used: 0 },
      ]),
    ).toBe(30);
    expect(allowedUnderCaps(50, [{ cap: null, used: 0 }])).toBe(50);
    expect(allowedUnderCaps(50, [{ cap: 10, used: 12 }])).toBe(0);
    expect(allowedUnderCaps(-5, [])).toBe(0);
  });
});

describe('cấu hình', () => {
  it('15 khoá trần, tên ổn định', () => {
    expect(CharityPointCapConfigKeys).toHaveLength(15);
    expect(charityPointCapConfigKey('CHARITY_ITEM_VALUE', 'daily')).toBe(
      'charity.points_cap.charity_item_value.daily',
    );
  });

  it('số nguyên không âm, hỏng thì mặc định', () => {
    expect(normalizeNonNegativeInt('7', 3)).toBe(7);
    expect(normalizeNonNegativeInt(-1, 3)).toBe(3);
    expect(normalizeNonNegativeInt(null, 3)).toBe(3);
    expect(normalizeNonNegativeInt(2.5, 3)).toBe(3);
  });
});

describe('isValidAppealValue', () => {
  it('điểm 0–100, giá trị VNĐ không âm', () => {
    expect(isValidAppealValue('EVALUATION', 100)).toBe(true);
    expect(isValidAppealValue('EVALUATION', 101)).toBe(false);
    expect(isValidAppealValue('ITEM_VALUE', 1_500_000)).toBe(true);
    expect(isValidAppealValue('ITEM_VALUE', -1)).toBe(false);
  });
});

describe('hệ số thưởng chiến dịch (CR 22/11/2026)', () => {
  it('bốn mức 0/20/50/100; 30 không hợp lệ', () => {
    expect([...CharityPointBonusPercents]).toEqual([0, 20, 50, 100]);
    expect(isCharityPointBonusPercent(50)).toBe(true);
    expect(isCharityPointBonusPercent(30)).toBe(false);
    expect(isCharityPointBonusPercent('50')).toBe(false);
  });

  it('bonusPoints(15, 50) = 7 (làm tròn xuống); không dương → 0', () => {
    expect(bonusPoints(15, 50)).toBe(7);
    expect(bonusPoints(15, 0)).toBe(0);
    expect(bonusPoints(0, 100)).toBe(0);
    expect(bonusPoints(-15, 50)).toBe(0);
  });

  it('bonusAdjustmentTarget giữ tỉ lệ theo điểm gốc sau chấm lại', () => {
    expect(
      bonusAdjustmentTarget({
        bonusApplied: 7,
        baseAppliedBefore: 15,
        baseAppliedAfter: 0,
      }),
    ).toBe(0);
    expect(
      bonusAdjustmentTarget({
        bonusApplied: 7,
        baseAppliedBefore: 15,
        baseAppliedAfter: 10,
      }),
    ).toBe(4);
    expect(
      bonusAdjustmentTarget({
        bonusApplied: 7,
        baseAppliedBefore: 0,
        baseAppliedAfter: 10,
      }),
    ).toBe(0);
  });

  it('mã thưởng không có khoá trần riêng — vẫn 15 khoá từ 5 rule gốc', () => {
    expect(CharityPointRuleCodes).toEqual([
      ...CharityPointBaseRuleCodes,
      'CHARITY_CAMPAIGN_BONUS',
    ]);
    expect(CharityPointCapConfigKeys).toHaveLength(15);
  });
});
