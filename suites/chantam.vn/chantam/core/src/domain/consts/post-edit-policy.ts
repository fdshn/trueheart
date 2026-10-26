import {
  GiftPostStatuses,
  LiveTransactionGiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
} from '../exceptions';

const EditableStatuses: readonly string[] = [
  GiftPostStatuses.DRAFT,
  GiftPostStatuses.PENDING_REVIEW,
  GiftPostStatuses.PUBLISHED,
];

/**
 * Rao vặt có thêm hai trạng thái chủ bài TỰ đặt (PR #46 §8): "Đã giữ chỗ" và "Tạm ẩn". Không
 * lượt trao nào kéo chúng, nên sửa/gỡ tin ở hai trạng thái này là việc bình thường của người
 * bán. `SOLD` là điểm cuối — không sửa.
 */
const ClassifiedEditableStatuses: readonly string[] = [
  ...EditableStatuses,
  GiftPostStatuses.RESERVED,
  GiftPostStatuses.HIDDEN,
];

/**
 * Trạng thái bài TỰ NÓ đã nói là có lượt trao sống.
 *
 * Đúng với bài cho/nhận: `RESERVED` chỉ do lượt trao đặt. KHÔNG đúng với Rao vặt — ở đó chủ
 * bài tự đặt `RESERVED`, nên lượt trao sống (kiểu cũ, trước PR #46) phải kiểm bằng bảng
 * `gift_transactions` (`hasLiveForPost` hoặc câu `EXISTS` dưới khoá hàng).
 */
export function statusImpliesLiveTransaction(
  post: Pick<IPostEntity, 'postType' | 'status'>,
): boolean {
  return (
    post.postType !== PostTypes.CLASSIFIED &&
    LiveTransactionGiftPostStatuses.includes(post.status)
  );
}

/** Trạng thái còn cho chủ bài sửa nội dung — chưa xét hạn hay lượt trao. */
export function isEditablePostStatus(
  post: Pick<IPostEntity, 'postType' | 'status'>,
): boolean {
  return (
    post.postType === PostTypes.CLASSIFIED
      ? ClassifiedEditableStatuses
      : EditableStatuses
  ).includes(post.status);
}

export function assertEditablePost(post: IPostEntity): void {
  if (statusImpliesLiveTransaction(post))
    throw new PostHasLiveTransactionException();
  if (
    !isEditablePostStatus(post) ||
    (post.expiresAt !== null && post.expiresAt <= new Date())
  )
    throw new PostInvalidStateException();
}
