import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class ReviewTransactionNotCompletedException extends ExceptionFrom(
  CoreErrors.REVIEW_TRANSACTION_NOT_COMPLETED,
) {}

export class ReviewAlreadySubmittedException extends ExceptionFrom(
  CoreErrors.REVIEW_ALREADY_SUBMITTED,
) {}

/** Chưa gửi đánh giá nào cho lượt trao này, nên không có gì để sửa. */
export class ReviewNotFoundException extends ExceptionFrom(
  CoreErrors.REVIEW_NOT_FOUND,
) {}

/**
 * Đã dùng hết lần sửa duy nhất (CHỐT-10 mục 4).
 *
 * Ném từ HAI chỗ, và cả hai đều cần: use case ném khi đọc thấy `editedAt` đã có,
 * còn repository ném khi câu `UPDATE ... AND edited_at IS NULL` khớp 0 hàng —
 * đường duy nhất thấy được hai request sửa song song.
 */
export class ReviewAlreadyEditedException extends ExceptionFrom(
  CoreErrors.REVIEW_ALREADY_EDITED,
) {}

/** Quá hạn `completed_at + review.grace.graceDays`; đánh giá đã khoá. */
export class ReviewEditWindowClosedException extends ExceptionFrom(
  CoreErrors.REVIEW_EDIT_WINDOW_CLOSED,
) {}
