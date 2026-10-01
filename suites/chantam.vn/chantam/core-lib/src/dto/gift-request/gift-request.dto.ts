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
  /**
   * Bài Muốn Tặng người gửi mang ra, khi lời tặng đi qua
   * `POST /posts/{id}/offer-gift`. `null` ở yêu cầu xin nhận thường.
   */
  offeringPostId: string | null;
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

export interface IOfferGiftBodyDto {
  /** Lời nhắn gửi chủ bài Muốn Nhận. */
  message: string;
  /**
   * Bài Muốn Tặng của chính người gửi, không bắt buộc.
   *
   * Có nó thì chủ bài xem được ảnh, danh mục và vị trí của món đồ thay vì chỉ
   * đọc một dòng chữ.
   */
  offeringPostId?: string;
}

export interface IOfferGiftResponseDto {
  request: IGiftRequestDto;
}

export interface IBatchAcceptRequestsBodyDto {
  /**
   * Các yêu cầu cần duyệt. Không được trùng nhau.
   *
   * Cả lô ăn cùng một quyết định: thiếu suất cho đủ số này thì KHÔNG duyệt một
   * phần nào cả.
   */
  requestIds: string[];
}

export interface IBatchAcceptedRequestDto {
  requestId: string;
  requesterId: string;
  transactionId: string;
}

export interface IBatchAcceptRequestsResponseDto {
  postId: string;
  accepted: IBatchAcceptedRequestDto[];
  /** Số suất còn lại sau lô. `0` nghĩa là bài đã chuyển `RESERVED`. */
  remainingQuantity: number;
  /**
   * Số yêu cầu còn lại bị đẩy sang `STANDBY` vì bài hết suất (F33).
   *
   * Luôn `0` khi `remainingQuantity > 0` — còn suất thì không ai bị xếp chờ.
   */
  standbyCount: number;
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
