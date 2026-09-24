import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';

export interface ISubmitTransactionReviewParams {
  readonly globalId: string;
  readonly transactionId: string;
  readonly reviewerId: string;
  readonly revieweeId: string;
  readonly reviewerRole: TransactionReviewRoles;
  readonly rating: number;
  /** Chỉ bên NHẬN mới có; bên TẶNG phải là `null`. */
  readonly accuracyPercent: number | null;
  readonly comment: string | null;
}

export interface IReviewableTransaction {
  readonly transactionId: string;
  readonly giverId: string;
  readonly receiverId: string;
  /** Vai của người đang hỏi. `null` khi họ không thuộc lượt trao này. */
  readonly role: TransactionReviewRoles | null;
  /** Đánh giá chỉ mở sau khi lượt trao đã hoàn tất. */
  readonly completed: boolean;
}

export interface IGiverAccuracyState {
  readonly percent: number | null;
  readonly samples: number;
  readonly reviewRequired: boolean;
}

export interface ITransactionReviewRepository {
  /**
   * Bối cảnh để quyết người này được đánh giá lượt trao đó hay không.
   *
   * Trả `null` khi lượt trao không tồn tại. Người ngoài cuộc nhận `role: null`
   * chứ không phải một lỗi riêng — phân biệt hai cái là để lộ ai trao đổi với ai.
   */
  findReviewable(
    transactionId: string,
    userId: string,
  ): Promise<IReviewableTransaction | null>;

  /**
   * Ghi đánh giá và tính lại chỉ số accuracy của người được đánh giá trong
   * CÙNG transaction.
   *
   * Tính lại từ toàn bộ mẫu chứ không cộng dồn: cộng dồn thì một lần ghi hỏng
   * là chỉ số lệch vĩnh viễn, và không ai phát hiện ra vì không còn gì để đối
   * chiếu.
   */
  submitReview(params: ISubmitTransactionReviewParams): Promise<{
    review: ITransactionReviewEntity;
    /** Trạng thái accuracy của người ĐƯỢC đánh giá sau lần ghi này. */
    accuracy: IGiverAccuracyState;
  }>;

  /** Đánh giá của một người cho một lượt trao. `null` khi chưa gửi. */
  findByReviewer(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null>;

  /** Đánh giá của bên còn lại trong lượt trao. */
  findCounterpart(
    transactionId: string,
    reviewerId: string,
  ): Promise<ITransactionReviewEntity | null>;

  /** Chỉ số accuracy đang công bố của một người. */
  getAccuracy(userId: string): Promise<IGiverAccuracyState>;
}

export const ITransactionReviewRepository = Symbol(
  'ITransactionReviewRepository',
);
