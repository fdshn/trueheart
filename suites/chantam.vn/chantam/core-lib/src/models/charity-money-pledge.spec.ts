import {
  CharityMoneyPledgeCodeAlphabet,
  charityMoneyPledgeTransferContent,
  isCharityMoneyPledgeAmount,
  moneyPledgePoints,
} from './charity-money-pledge';

describe('moneyPledgePoints', () => {
  it('500.000đ, 1 điểm / 10.000đ, 50% → 25 điểm (ví dụ của Product)', () => {
    expect(
      moneyPledgePoints({
        pledgedAmount: 500_000,
        itemValueRulePoints: 1,
        percent: 50,
      }),
    ).toBe(25);
  });

  it('làm tròn xuống sau khi nhân hết, không mất phần lẻ giữa chừng', () => {
    // 15.000đ × 1 × 50% = 0,75 điểm → 0; 30.000đ → 1,5 → 1.
    expect(
      moneyPledgePoints({
        pledgedAmount: 15_000,
        itemValueRulePoints: 1,
        percent: 50,
      }),
    ).toBe(0);
    expect(
      moneyPledgePoints({
        pledgedAmount: 30_000,
        itemValueRulePoints: 1,
        percent: 50,
      }),
    ).toBe(1);
  });

  it('tỷ lệ 0 hoặc rule 0 điểm thì không có điểm', () => {
    expect(
      moneyPledgePoints({
        pledgedAmount: 1_000_000,
        itemValueRulePoints: 1,
        percent: 0,
      }),
    ).toBe(0);
    expect(
      moneyPledgePoints({
        pledgedAmount: 1_000_000,
        itemValueRulePoints: 0,
        percent: 50,
      }),
    ).toBe(0);
  });

  it('trần 10 tỷ vẫn là số nguyên an toàn', () => {
    const points = moneyPledgePoints({
      pledgedAmount: 10_000_000_000,
      itemValueRulePoints: 3,
      percent: 100,
    });
    expect(points).toBe(3_000_000);
    expect(Number.isSafeInteger(points)).toBe(true);
  });
});

describe('isCharityMoneyPledgeAmount', () => {
  it('nguyên VNĐ trong 1.000 → 10 tỷ', () => {
    expect(isCharityMoneyPledgeAmount(1_000)).toBe(true);
    expect(isCharityMoneyPledgeAmount(10_000_000_000)).toBe(true);
    expect(isCharityMoneyPledgeAmount(999)).toBe(false);
    expect(isCharityMoneyPledgeAmount(10_000_000_001)).toBe(false);
    expect(isCharityMoneyPledgeAmount(1_500.5)).toBe(false);
    expect(isCharityMoneyPledgeAmount('5000')).toBe(false);
  });
});

describe('nội dung chuyển khoản', () => {
  it('CT <mã>, bảng chữ không có ký tự dễ nhầm', () => {
    expect(charityMoneyPledgeTransferContent('7K2QXA')).toBe('CT 7K2QXA');
    for (const confusing of ['0', 'O', '1', 'I', 'L'])
      expect(CharityMoneyPledgeCodeAlphabet).not.toContain(confusing);
  });
});
