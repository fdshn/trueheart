import { GiftRequestStatuses } from '../../consts';

export interface ICreateGiftRequestBodyDto {
  message: string;
}

export interface IGiftRequestDto {
  id: string;
  postId: string;
  requesterId: string;
  message: string;
  status: GiftRequestStatuses;
  queueJoinedAt: Date;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateGiftRequestResponseDto {
  request: IGiftRequestDto;
}

export interface IWithdrawGiftRequestResponseDto {
  request: IGiftRequestDto;
}

export interface IPostApplicantProfileDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: string;
}

export interface IPostRequestItemDto {
  id: string;
  postId: string;
  requesterId: string;
  message: string;
  status: GiftRequestStatuses;
  queueJoinedAt: Date;
  createdAt: Date;
  requester?: IPostApplicantProfileDto;
}

export interface IGetPostRequestsResponseDto {
  requests: IPostRequestItemDto[];
  total: number;
}

export interface IAcceptGiftRequestResponseDto {
  requestId: string;
  postId: string;
  status: GiftRequestStatuses;
  transactionId?: string;
}

export interface IRedeemPostWithPointsResponseDto {
  postId: string;
  transactionId: string;
  /** Số điểm đã trừ. */
  pointsSpent: number;
  /** Điểm còn lại sau khi trừ. */
  balanceAfter: number;
}
