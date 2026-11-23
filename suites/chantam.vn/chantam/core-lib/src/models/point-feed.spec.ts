import {
  PointFeedExcludedRuleCodes,
  PointFeedMergedRuleCodes,
  normalizePointFeedDisplayIntervalMs,
  normalizePointFeedMinDelta,
  normalizePointFeedPollSeconds,
} from './point-feed';
import { PointRuleTitles } from './point-rule-title';

describe('bảng tin điểm — phân loại rule (CR 22/11/2026)', () => {
  it('kiểm kê: mọi khoá PointRuleTitles thuộc đúng một nhóm (hiện / loại trừ / gộp)', () => {
    const keys = Object.keys(PointRuleTitles);
    const excluded = new Set<string>(PointFeedExcludedRuleCodes);
    const merged = new Set<string>(PointFeedMergedRuleCodes);
    for (const code of excluded)
      expect({ code, known: keys.includes(code) }).toEqual({
        code,
        known: true,
      });
    for (const code of merged)
      expect({ code, known: keys.includes(code) }).toEqual({
        code,
        known: true,
      });
    expect([...excluded].filter((code) => merged.has(code))).toEqual([]);
    const shown = keys.filter(
      (code) => !excluded.has(code) && !merged.has(code),
    );
    expect(shown.length + excluded.size + merged.size).toBe(keys.length);
  });

  it('tập loại trừ đúng 7 mã của spec — thêm mã phạt mới mà không phân loại thì đỏ', () => {
    expect([...PointFeedExcludedRuleCodes].sort()).toEqual(
      [
        'ADMIN_ADJUSTMENT',
        'REVERSAL',
        'ITEM_REDEMPTION',
        'CONTENT_VIOLATION_PENALTY',
        'SHIP_UNPAID_PENALTY',
        'MAINTENANCE_FAILED',
        'GROUP_AFFILIATE_REVERSAL',
      ].sort(),
    );
    expect([...PointFeedMergedRuleCodes]).toEqual(['CHARITY_CAMPAIGN_BONUS']);
  });

  it('mọi mã có tên "phạt/trừ/thu hồi/hoàn" đều nằm trong tập loại trừ', () => {
    const negative = Object.entries(PointRuleTitles)
      .filter(([, title]) =>
        /phạt|trừ điểm|thu hồi|hoàn điểm|điều chỉnh|đổi điểm/i.test(title),
      )
      .map(([code]) => code);
    for (const code of negative)
      expect({
        code,
        excluded: (PointFeedExcludedRuleCodes as readonly string[]).includes(
          code,
        ),
      }).toEqual({ code, excluded: true });
  });

  it('cấu hình hỏng/thiếu về mặc định, ngoài khoảng bị kẹp', () => {
    expect(normalizePointFeedMinDelta(undefined)).toBe(10);
    expect(normalizePointFeedMinDelta(25)).toBe(25);
    expect(normalizePointFeedPollSeconds('x')).toBe(15);
    expect(normalizePointFeedPollSeconds(1)).toBe(5);
    expect(normalizePointFeedPollSeconds(99_999)).toBe(3600);
    expect(normalizePointFeedDisplayIntervalMs(null)).toBe(2000);
    expect(normalizePointFeedDisplayIntervalMs(50)).toBe(200);
    expect(normalizePointFeedDisplayIntervalMs(120_000)).toBe(60_000);
  });
});
