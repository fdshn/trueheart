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
  close(params: ICloseGiftTransactionParams): Promise<IGiftTransactionSummary>;
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
}

export const IGiftTransactionRepository = Symbol('IGiftTransactionRepository');
