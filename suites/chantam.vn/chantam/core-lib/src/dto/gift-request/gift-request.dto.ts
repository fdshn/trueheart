import { GiftPostStatuses, GiftRequestStatuses } from '../../consts';

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

/**
 * Một dòng trong màn "Yêu cầu của tôi".
 *
 * Kèm thông tin BÀI ngay trên dòng. Không có nó thì người dùng nhìn thấy một
 * danh sách id và phải mở từng cái — mà bài đã hết hạn thì mở cũng không còn.
 */
export interface IMyGiftRequestDto extends IGiftRequestDto {
  postTitle: string;
  postStatus: GiftPostStatuses;
  /** Ảnh đầu tiên của bài, `null` khi bài không có ảnh. */
  postThumbnailUrl: string | null;
  /** `true` khi bài không còn nhận yêu cầu — để client hiện nhãn "đã đóng". */
  postClosed: boolean;
}

export interface IListMyGiftRequestsResponseDto {
  requests: IMyGiftRequestDto[];
  meta: unknown;
}

export interface IRejectGiftRequestResponseDto {
  request: IGiftRequestDto;
}
