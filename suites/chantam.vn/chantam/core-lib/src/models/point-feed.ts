/**
 * Bảng tin điểm công khai (CR 22/11/2026): ai vừa được cộng điểm vì việc gì.
 *
 * Chỉ bút toán DƯƠNG của rule "hiện". Bút toán phạt, điều chỉnh tay, đảo, đổi điểm không bao
 * giờ lên bảng tin (lộ lý do phạt/điều chỉnh). Thưởng hệ số chiến dịch không thành dòng riêng —
 * gộp vào dòng gốc của nó. Thêm rule mới vào `PointRuleTitles` mà quên phân loại thì phép kiểm
 * kê `point-feed.spec.ts` đỏ.
 */
export const PointFeedExcludedRuleCodes = [
  'ADMIN_ADJUSTMENT',
  'REVERSAL',
  'ITEM_REDEMPTION',
  'CONTENT_VIOLATION_PENALTY',
  'SHIP_UNPAID_PENALTY',
  'MAINTENANCE_FAILED',
  'GROUP_AFFILIATE_REVERSAL',
] as const;

/** Không bao giờ là một dòng — cộng vào dòng gốc (`reference_type = 'POINT_LEDGER'`). */
export const PointFeedMergedRuleCodes = ['CHARITY_CAMPAIGN_BONUS'] as const;

export const PointFeedMaxLimit = 50;
export const PointFeedDefaultLimit = 20;
export const PointFeedCacheTtlSeconds = 5;
/** Số lần gọi bảng tin mỗi người xem trong một phút. */
export const PointFeedRateLimitPerMinute = 30;

export const PointFeedMinDeltaConfigKey = 'point.feed_min_delta';
export const DefaultPointFeedMinDelta = 10;
export const PointFeedPollSecondsConfigKey = 'point.feed_poll_seconds';
export const DefaultPointFeedPollSeconds = 15;
export const PointFeedDisplayIntervalMsConfigKey =
  'point.feed_display_interval_ms';
export const DefaultPointFeedDisplayIntervalMs = 2000;

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Bảng tin chung chỉ hiện bút toán (gốc + thưởng) ≥ ngưỡng này. 0–1 000 000. */
export function normalizePointFeedMinDelta(value: unknown): number {
  return clampInt(value, DefaultPointFeedMinDelta, 0, 1_000_000);
}

/** App hỏi lại sau bao nhiêu giây. 5–3600. */
export function normalizePointFeedPollSeconds(value: unknown): number {
  return clampInt(value, DefaultPointFeedPollSeconds, 5, 3600);
}

/** Mỗi dòng mới hiện cách nhau bao nhiêu mili giây. 200–60 000. */
export function normalizePointFeedDisplayIntervalMs(value: unknown): number {
  return clampInt(value, DefaultPointFeedDisplayIntervalMs, 200, 60_000);
}
