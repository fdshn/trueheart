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
 * Bản đánh giá TRƯỚC lần sửa duy nhất, chụp bởi trigger ở database.
 *
 * Bốn trường, không phải một bảng revision: "sửa tối đa một lần" (CHỐT-10 mục 4)
 * làm bản cũ có kích cỡ cố định — đúng một phiên bản trước. Một bảng cho một hàng
 * là ba câu JOIN để đọc thứ bốn cột nói xong.
 *
 * `editedAt` là `null` khi chưa sửa, và đó là tín hiệu "còn quyền sửa" ở
 * `EditReviewUseCase` — cùng một sự thật mà trigger dùng để chặn lần thứ hai.
 */
export interface ITransactionReviewAudit {
  editedAt: Date | null;
  previousRating: number | null;
  previousAccuracyPercent: number | null;
  previousComment: string | null;
}

/**
 * Cố ý KHÔNG mixin `IAuditableEntity` hay `ISoftDeletableEntity`.
 *
 * Từ 11/10 bảng cho sửa ĐÚNG một lần (CHỐT-10 mục 4), nhưng bất biến chỉ nới chứ
 * không bỏ: lần sửa đi qua một trigger tự chụp bản cũ vào `previous_*`, và không
 * có đường xoá. `ISoftDeletableEntity` sẽ thêm một cột `deleted_at` mà không
 * trigger nào canh — tức một đường biến đánh giá thành vô hình.
 */
export interface ITransactionReviewEntity
  extends
    IBaseEntity,
    IDistributedEntity,
    ITransactionReview,
    ITransactionReviewAudit {
  createdAt: Date;
}
export const ITransactionReviewEntity = Symbol('ITransactionReviewEntity');
