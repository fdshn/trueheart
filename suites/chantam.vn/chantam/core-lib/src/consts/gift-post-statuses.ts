/**
 * Vòng đời bài đăng cho tặng.
 *
 * ```
 * DRAFT ─▶ PENDING_REVIEW ─▶ PUBLISHED ─▶ RESERVED ─▶ COMPLETED
 *                  │              │           │
 *                  ▼              ▼           ▼
 *              REJECTED       EXPIRED     CANCELLED
 *                                 │
 *                                 ▼
 *                             ARCHIVED  (chuyển vào Kho Từ Thiện Chung)
 * ```
 *
 * `EXPIRED` ứng với quy định "quá một tháng không có người nhận" (đặc tả mục 3.2);
 * `ARCHIVED` là khi đã chuyển sang Kho Từ Thiện Chung.
 *
 * Trạng thái bài do lượt trao điều khiển được SUY RA, không ai đặt tay: còn hàng
 * thì `PUBLISHED`, hết hàng mà lượt trao đang chạy thì `RESERVED`, hết hàng và
 * không còn lượt nào thì `COMPLETED`. Luật đó nằm ở `syncPostStatus`.
 */
export enum GiftPostStatuses {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
  /** Hết kho, lượt trao đang chạy. */
  RESERVED = 'RESERVED',
  /**
   * @deprecated KHÔNG dùng cho bài đăng nữa — chốt 29/09 giữ `RESERVED`.
   *
   * Trước đó đây là tên thứ hai cho cùng một nghĩa với `RESERVED`, và hai tên
   * nghĩa là mọi chỗ đọc phải kiểm cả hai; chỗ nào quên một tên là một lỗ thật —
   * `syncPostStatus` từng quên, nên bài đã giao hết suất không bao giờ được suy
   * lại trạng thái và tác giả mất vĩnh viễn một suất đăng bài.
   *
   * Giá trị còn ở đây vì gỡ một giá trị enum đang được cột dùng đòi dựng lại cả
   * type Postgres. Không đường nào ghi ra nó nữa; `syncPostStatus` vẫn nhận nó
   * như lưới hứng cho dòng sót. `DELIVERING` của LƯỢT TRAO
   * (`gift_transactions.status`) là chuyện khác và vẫn dùng bình thường.
   */
  DELIVERING = 'DELIVERING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Trạng thái bài nghĩa là ĐANG CÓ LƯỢT TRAO SỐNG — không sửa, không gỡ.
 *
 * Một danh sách dùng chung, không phải bốn mảng viết tay. Trước đây
 * `delete-post`, `update-post`, `post-edit-policy` và `lock-editable-post` mỗi
 * nơi tự khai, nên quên một tên ở một nơi là một lỗ — và đã quên thật.
 *
 * `DELIVERING` vẫn nằm đây dù đã bị loại khỏi đường GHI (chốt 29/09 giữ
 * `RESERVED`, migration `1795200000000`): đây là chỗ ĐỌC, và bỏ một tên khỏi hàng
 * rào không phải dọn tên mà là tháo hàng rào. Migration chỉ chạy trên môi trường
 * đã migrate; một dòng sót không được thành cửa gỡ bài đang có người chờ ở đầu bên
 * kia. Gỡ `DELIVERING` khỏi đây chỉ nên làm khi đã soi thật rằng không môi trường
 * nào còn dòng nào mang tên đó.
 */
export const LiveTransactionGiftPostStatuses: readonly GiftPostStatuses[] = [
  GiftPostStatuses.RESERVED,
  GiftPostStatuses.DELIVERING,
];

/** Các trạng thái mà bài đăng còn hiển thị công khai trên bảng tin và bản đồ. */
export const PubliclyVisibleGiftPostStatuses: readonly GiftPostStatuses[] = [
  GiftPostStatuses.PUBLISHED,
  GiftPostStatuses.RESERVED,
];
