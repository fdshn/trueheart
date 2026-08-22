/**
 * Vòng đời bài đăng cho tặng.
 *
 * ```
 * DRAFT ─▶ PENDING_REVIEW ─▶ PUBLISHED ─▶ RESERVED ─▶ DELIVERING ─▶ COMPLETED
 *                  │              │           │            │
 *                  ▼              ▼           ▼            ▼
 *              REJECTED       EXPIRED     CANCELLED    CANCELLED
 *                                 │
 *                                 ▼
 *                             ARCHIVED  (chuyển vào Kho Từ Thiện Chung)
 * ```
 *
 * `EXPIRED` ứng với quy định "quá một tháng không có người nhận" (đặc tả mục 3.2);
 * `ARCHIVED` là khi đã chuyển sang Kho Từ Thiện Chung.
 */
export enum GiftPostStatuses {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
  RESERVED = 'RESERVED',
  DELIVERING = 'DELIVERING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
}

/** Các trạng thái mà bài đăng còn hiển thị công khai trên bảng tin và bản đồ. */
export const PubliclyVisibleGiftPostStatuses: readonly GiftPostStatuses[] = [
  GiftPostStatuses.PUBLISHED,
  GiftPostStatuses.RESERVED,
];
