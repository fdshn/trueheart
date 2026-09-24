import { TransactionReviewRoles } from '../../models';

export interface ISubmitReviewDto {
  /** Trải nghiệm chung, 1–5 sao. */
  rating: number;
  /**
   * Mức chính xác của mô tả so với hàng thật, 0–100.
   *
   * BẮT BUỘC khi người gửi là bên NHẬN, và phải bỏ trống khi là bên TẶNG.
   */
  accuracyPercent?: number;
  comment?: string;
}

export interface ISubmitReviewBodyDto {
  review: ISubmitReviewDto;
}

export interface ITransactionReviewDto {
  reviewId: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  reviewerRole: TransactionReviewRoles;
  rating: number;
  accuracyPercent: number | null;
  comment: string | null;
  createdAt: Date;
}

export interface ISubmitReviewResponseDto {
  review: ITransactionReviewDto;
}

export interface IGiverAccuracyDto {
  /** `null` khi chưa đủ mẫu — chưa đủ thì không công bố con số nào. */
  percent: number | null;
  samples: number;
  /** Số mẫu còn thiếu để công bố. `0` khi đã đủ. */
  samplesUntilPublished: number;
}

export interface IGetTransactionReviewsResponseDto {
  /** Đánh giá của chính người gọi cho lượt trao này, `null` khi chưa gửi. */
  mine: ITransactionReviewDto | null;
  /** Đánh giá của bên kia. Chỉ hiện SAU khi người gọi đã gửi của mình. */
  counterpart: ITransactionReviewDto | null;
}
