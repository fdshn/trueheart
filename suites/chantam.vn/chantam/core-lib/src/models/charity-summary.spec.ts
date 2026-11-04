import { isFeaturedNow, summaryNeedsFinancialReport } from './charity-summary';

describe('summaryNeedsFinancialReport', () => {
  it('có tiền xác nhận hoặc nhập ngoài thì cần báo cáo; không có thì không', () => {
    expect(summaryNeedsFinancialReport([])).toBe(false);
    expect(
      summaryNeedsFinancialReport([{ confirmedAmount: 0, externalAmount: 0 }]),
    ).toBe(false);
    expect(
      summaryNeedsFinancialReport([{ confirmedAmount: 0, externalAmount: 5 }]),
    ).toBe(true);
  });
});

describe('isFeaturedNow', () => {
  const now = new Date('2026-11-05T00:00:00Z');
  it('tắt / chưa tới / đã hết thì không hiện; trong khung hoặc không giới hạn thì hiện', () => {
    const base = {
      featuredOnHome: true,
      featuredFrom: null,
      featuredUntil: null,
    };
    expect(isFeaturedNow({ ...base, featuredOnHome: false }, now)).toBe(false);
    expect(isFeaturedNow(base, now)).toBe(true);
    expect(
      isFeaturedNow(
        { ...base, featuredFrom: new Date('2026-11-06T00:00:00Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isFeaturedNow(
        { ...base, featuredUntil: new Date('2026-11-05T00:00:00Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isFeaturedNow(
        {
          ...base,
          featuredFrom: new Date('2026-11-01T00:00:00Z'),
          featuredUntil: new Date('2026-11-10T00:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
  });
});
