/**
 * Dự án từ thiện 4 giai đoạn — đợt 4a (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.6, §3.14,
 * §3.17): tổng kết, báo cáo tài chính, chấm mức hoàn thành, nickname công khai, card Home.
 */

export const CharityFeaturedCtas = ['VIEW', 'SUPPORT', 'JOIN'] as const;
export type CharityFeaturedCta = (typeof CharityFeaturedCtas)[number];

export const CharityEvaluationSources = [
  'ORGANIZER',
  'APPEAL',
  'ADMIN',
] as const;
export type CharityEvaluationSource = (typeof CharityEvaluationSources)[number];

/** Danh sách nickname công khai dài tối đa bao nhiêu — đủ để vinh danh, không thành danh bạ. */
export const MaxPublicSupporterNames = 200;

/**
 * Dự án có nhận tiền (§3.6): tổng số tiền đã xác nhận trong app + nhập từ nguồn ngoài của mọi
 * hạng mục kêu gọi tiền > 0. Khi đó phải có báo cáo tài chính (kèm sao kê) mới công khai được
 * tổng kết.
 */
export function summaryNeedsFinancialReport(
  fundingNeeds: readonly { confirmedAmount: number; externalAmount: number }[],
): boolean {
  return fundingNeeds.some(
    (need) => need.confirmedAmount + need.externalAmount > 0,
  );
}

/**
 * Card Home đang hiện: Admin bật, trong khung giờ (bỏ trống = không giới hạn đầu/cuối), dự án
 * còn hiện ra ngoài.
 */
export function isFeaturedNow(
  input: {
    readonly featuredOnHome: boolean;
    readonly featuredFrom: Date | null;
    readonly featuredUntil: Date | null;
  },
  now: Date,
): boolean {
  if (!input.featuredOnHome) return false;
  if (input.featuredFrom && input.featuredFrom.getTime() > now.getTime())
    return false;
  if (input.featuredUntil && input.featuredUntil.getTime() <= now.getTime())
    return false;
  return true;
}
