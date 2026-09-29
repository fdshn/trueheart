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
  /**
   * Mức chính xác bên kia đã chấm, khi người gọi được phép thấy.
   *
   * Người TẶNG thấy ngay cả khi chưa gửi đánh giá của mình: con số này là **hệ số
   * tính thưởng** của họ (56 × mức chính xác), không phải một ý kiến về họ. Che nó
   * đi nghĩa là họ thấy 24 điểm rơi vào sổ mà không biết con số nào tạo ra — và
   * `reason` của bút toán trong `GET /points/me/ledger` vốn đã ghi thẳng con số
   * đó, nên che ở đây chỉ khiến hai endpoint nói khác nhau.
   *
   * Bình luận và điểm sao thì vẫn kín cho tới khi cả hai đã gửi — đó mới là chỗ
   * trả đũa được.
   */
  counterpartAccuracyPercent: number | null;
  /** Đánh giá của chính người gọi cho lượt trao này, `null` khi chưa gửi. */
  mine: ITransactionReviewDto | null;
  /** Đánh giá của bên kia. Chỉ hiện SAU khi người gọi đã gửi của mình. */
  counterpart: ITransactionReviewDto | null;
}
