export type GiftTransactionStatuses =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

/** Những trạng thái còn giữ chỗ trên bài đăng. */
export const OpenGiftTransactionStatuses: GiftTransactionStatuses[] = [
  'REQUESTED',
  'ACCEPTED',
  'DELIVERING',
];

export interface IGiftTransactionSummary {
  readonly globalId: string;
  readonly postId: string;
  readonly giverId: string;
  readonly receiverId: string;
  readonly quantity: number;
  readonly status: GiftTransactionStatuses;
  readonly requestedAt: Date;
  readonly acceptedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface IRequestGiftParams {
  readonly globalId: string;
  readonly postId: string;
  readonly receiverId: string;
  readonly quantity: number;
}

export interface ICloseGiftTransactionParams {
  readonly transactionId: string;
  readonly actorUserId: string;
  readonly status: Extract<GiftTransactionStatuses, 'CANCELLED' | 'REJECTED'>;
  readonly reason: string;
}

/**
 * Hàng đợi dự phòng sau khi một lượt trao bị đóng (F33, F35).
 *
 * Trả về để **use case** gửi thông báo, không phải repository: thông báo phải
 * đi SAU khi transaction commit, nếu không sẽ báo cho người dùng về một lượt
 * huỷ có thể còn bị rollback.
 */
export interface IReopenedQueue {
  /** Số ứng viên vừa được đưa trở lại hàng chờ xét. */
  readonly reopenedCount: number;
  /**
   * Ứng viên kế tiếp theo thứ tự vào hàng đợi, hoặc `null` khi không còn ai.
   *
   * Đây là **đề xuất**, không phải quyết định: hệ thống tuyệt đối không tự trao
   * cho người này (F33). Người cho vẫn phải bấm duyệt.
   */
  readonly nextCandidateId: string | null;
}

export interface ICloseGiftTransactionResult {
  readonly transaction: IGiftTransactionSummary;
  readonly queue: IReopenedQueue;
}

export interface IGiftTransactionRepository {
  findByGlobalId(globalId: string): Promise<IGiftTransactionSummary | null>;
  listForUser(userId: string): Promise<IGiftTransactionSummary[]>;
  /** Người nhận xin một suất. Bài phải đang PUBLISHED và còn hàng. */
  request(params: IRequestGiftParams): Promise<IGiftTransactionSummary>;
  /**
   * Người tặng duyệt một yêu cầu. Trừ tồn kho NGUYÊN TỬ trong cùng transaction
   * — đọc rồi ghi là hai người cùng duyệt sẽ vượt số lượng thật.
   */
  accept(
    transactionId: string,
    giverId: string,
  ): Promise<IGiftTransactionSummary>;
  /** Người nhận xác nhận đã nhận. Đây là mốc tính hoạt động cho rank. */
  confirmReceipt(
    transactionId: string,
    receiverId: string,
  ): Promise<IGiftTransactionSummary>;
  /**
   * Đóng một lượt trao, trả tồn kho, và **mở lại hàng đợi** (F35).
   *
   * Ứng viên đang `STANDBY` quay về `PENDING` để người cho thấy họ là việc cần
   * làm; yêu cầu của người vừa bị huỷ chuyển sang `CANCELLED` và KHÔNG quay lại
   * hàng đợi — họ đã được chọn một lần và lượt đó đổ.
   */
  close(
    params: ICloseGiftTransactionParams,
  ): Promise<ICloseGiftTransactionResult>;
  /**
   * Số lần một người đóng lượt trao với trạng thái đã cho (F35).
   *
   * Đếm từ `closed_by` chứ không từ một bộ đếm trên `users`: hai con số nói về
   * cùng một sự thật thì sớm muộn lệch nhau.
   */
  countClosedBy(
    userId: string,
    status: Extract<GiftTransactionStatuses, 'CANCELLED' | 'REJECTED'>,
  ): Promise<number>;
  /**
   * Tự hoàn tất những lượt đã duyệt quá hạn. Gọi từ scheduler NGOÀI tiến trình,
   * giống rank maintenance; repo cấm `@nestjs/schedule`.
   */
  completeDueDeliveries(olderThanDays: number): Promise<number>;
  /** Số lượt tặng đã hoàn tất của một người tặng, dùng cho rank. */
  countCompletedByGiver(
    giverId: string,
    window?: { from: Date; to: Date },
  ): Promise<number>;
  /**
   * Số lượt còn dở dang mà người này đang tham gia, ở CẢ hai vai.
   *
   * Dùng để chặn xoá tài khoản (F06): xoá giữa chừng là bỏ phía bên kia treo
   * với một lượt trao không bao giờ kết thúc.
   */
  countOpenForUser(userId: string): Promise<number>;
}

export const IGiftTransactionRepository = Symbol('IGiftTransactionRepository');
