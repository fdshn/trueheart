import {
  CharityPointCapConfigKeys,
  allowedUnderCaps,
  charityPointCapConfigKey,
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

  it('ảnh/clip: cộng tác viên × hệ số, ban tổ chức mức cơ sở', () => {
    const base = {
      mediaCount: 3,
      rulePoints: 5,
      participantMultiplierPercent: 200,
    };
    expect(postMediaPoints({ ...base, participant: false })).toBe(15);
    expect(postMediaPoints({ ...base, participant: true })).toBe(30);
    expect(postMediaPoints({ ...base, mediaCount: 0, participant: true })).toBe(
      0,
    );
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
  it('12 khoá trần, tên ổn định', () => {
    expect(CharityPointCapConfigKeys).toHaveLength(12);
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
