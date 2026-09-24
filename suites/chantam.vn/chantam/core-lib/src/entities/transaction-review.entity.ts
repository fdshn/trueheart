import {
  IBaseEntity,
  IDistributedEntity,
} from '@chantam/service.persistency-lib/entities';
import { TransactionReviewRoles } from '../models/transaction-review';

export interface ITransactionReview {
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  reviewerRole: TransactionReviewRoles;
  /** Trải nghiệm chung, 1–5 sao. */
  rating: number;
  /**
   * Mức chính xác của mô tả so với hàng thật, 0–100 (F43).
   *
   * Chỉ NGƯỜI NHẬN chấm — người tặng không ở vị trí đánh giá mô tả của chính
   * mình, và ràng buộc đó do database giữ.
   */
  accuracyPercent: number | null;
  comment: string | null;
}

/**
 * Cố ý KHÔNG mixin `IAuditableEntity` hay `ISoftDeletableEntity`: đánh giá chỉ
 * được ghi thêm. Chỉ số accuracy quyết định một tài khoản có vào diện xem xét
 * hay không, nên một đánh giá sửa được sau đó chứng minh được rất ít.
 */
export interface ITransactionReviewEntity
  extends IBaseEntity, IDistributedEntity, ITransactionReview {
  createdAt: Date;
}
export const ITransactionReviewEntity = Symbol('ITransactionReviewEntity');
