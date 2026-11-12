import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

export interface IRebalancedRequest {
  readonly requestId: string;
  readonly requesterId: string;
  readonly fromStatus: 'PENDING' | 'STANDBY';
  readonly toStatus: 'PENDING' | 'STANDBY';
  readonly statusReason: 'OUT_OF_STOCK' | 'INSUFFICIENT_QUANTITY' | null;
  readonly postId: string;
  readonly postTitle: string;
  /** Số còn lại của bài lúc cân — để thông báo nói đúng con số. */
  readonly remainingQuantity: number;
  readonly requestedQuantity: number;
}

/**
 * Cân lại hàng chờ của MỘT bài theo số còn lại hiện tại — một luật cho mọi đường làm kho đổi
 * (duyệt, duyệt lô, huỷ / mở lại lượt trao, chủ bài sửa số lượng):
 *
 * > Request đang chờ là `PENDING` khi `requested_quantity <= remaining_quantity` và bài đang
 * > `PUBLISHED`; còn lại là `STANDBY` với lý do `OUT_OF_STOCK` (kho về 0) hoặc
 * > `INSUFFICIENT_QUANTITY` (còn hàng nhưng ít hơn số xin).
 *
 * KHÔNG đổi `requested_quantity` (không tự giảm số người ta đăng ký) và KHÔNG đổi
 * `queue_joined_at` (chuyển qua lại không làm mất chỗ trong hàng).
 *
 * Gọi TRONG transaction đang giữ khoá dòng `posts` (hoặc ngay sau khi ghi `posts` trong cùng
 * transaction) — đọc `remaining_quantity` ngoài khoá là cân theo một con số đã cũ.
 *
 * Bài đã đóng (`COMPLETED`, `EXPIRED`…) không đụng tới: các đường đóng bài tự huỷ request.
 */
export async function rebalanceOpenRequests(
  manager: EntityManager,
  postId: string,
): Promise<IRebalancedRequest[]> {
  const rows = await updateReturning<{
    global_id: string;
    requester_id: string;
    from_status: 'PENDING' | 'STANDBY';
    to_status: 'PENDING' | 'STANDBY';
    status_reason: 'OUT_OF_STOCK' | 'INSUFFICIENT_QUANTITY' | null;
    post_id: string;
    post_title: string;
    remaining_quantity: number | string;
    requested_quantity: number | string;
  }>(
    manager,
    `
      WITH target AS (
        SELECT request.global_id,
               post.title AS post_title,
               post.remaining_quantity,
               request.status::text AS from_status,
               CASE
                 WHEN post.status = 'PUBLISHED'
                      AND request.requested_quantity <= post.remaining_quantity
                   THEN 'PENDING'
                 ELSE 'STANDBY'
               END AS to_status,
               CASE
                 WHEN post.status = 'PUBLISHED'
                      AND request.requested_quantity <= post.remaining_quantity
                   THEN NULL
                 WHEN post.remaining_quantity = 0 THEN 'OUT_OF_STOCK'
                 ELSE 'INSUFFICIENT_QUANTITY'
               END AS next_reason
          FROM gift_requests request
          JOIN posts post ON post.global_id = request.post_id
         WHERE request.post_id = $1
           AND request.deleted_at IS NULL
           AND request.status IN ('PENDING', 'STANDBY')
           AND post.deleted_at IS NULL
           AND post.status IN ('PUBLISHED', 'RESERVED')
      )
      UPDATE gift_requests request
         SET status = target.to_status::gift_requests_status_enum,
             status_reason = target.next_reason,
             updated_at = now()
        FROM target
       WHERE request.global_id = target.global_id
         AND (request.status::text <> target.to_status
              OR request.status_reason IS DISTINCT FROM target.next_reason)
      RETURNING request.global_id, request.requester_id, request.post_id,
                request.requested_quantity,
                target.post_title, target.remaining_quantity,
                target.from_status, target.to_status,
                target.next_reason AS status_reason
    `,
    [postId],
  );
  return rows.map((row) => ({
    requestId: row.global_id,
    requesterId: row.requester_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    statusReason: row.status_reason,
    postId: row.post_id,
    postTitle: row.post_title,
    remainingQuantity: Number(row.remaining_quantity),
    requestedQuantity: Number(row.requested_quantity),
  }));
}
