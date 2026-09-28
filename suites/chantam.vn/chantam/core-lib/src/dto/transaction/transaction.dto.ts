/**
 * Bốn trạng thái còn sống.
 *
 * `REQUESTED` và `REJECTED` đã dọn 28/09: cái đầu chỉ sinh ra được từ
 * `POST /transactions` — cửa đã gỡ — còn cái sau chưa đường nào từng ghi.
 */
export type GiftTransactionStatusDto =
  'ACCEPTED' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';

export interface IGiftTransactionDto {
  transactionId: string;
  postId: string;
  giverId: string;
  receiverId: string;
  quantity: number;
  status: GiftTransactionStatusDto;
  requestedAt: Date;
  acceptedAt: Date | null;
  /** Mốc người tặng báo đã trao đồ — gửi đi, hoặc trao tận tay. */
  handedOverAt: Date | null;
  completedAt: Date | null;
}

export interface IRequestGiftDto {
  postId: string;
  quantity?: number;
}
export interface IRequestGiftBodyDto {
  giftRequest: IRequestGiftDto;
}

export interface ICancelGiftTransactionDto {
  reason: string;
}
export interface ICancelGiftTransactionBodyDto {
  cancellation: ICancelGiftTransactionDto;
}

export interface IGiftTransactionResponseDto {
  transaction: IGiftTransactionDto;
}

export interface IListGiftTransactionsResponseDto {
  transactions: IGiftTransactionDto[];
}
