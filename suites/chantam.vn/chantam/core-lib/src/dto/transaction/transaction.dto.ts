export type GiftTransactionStatusDto =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface IGiftTransactionDto {
  transactionId: string;
  postId: string;
  giverId: string;
  receiverId: string;
  quantity: number;
  status: GiftTransactionStatusDto;
  requestedAt: Date;
  acceptedAt: Date | null;
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
