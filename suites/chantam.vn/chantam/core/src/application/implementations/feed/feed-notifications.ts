import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CommentStatuses,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';

/**
 * Thông báo cho tương tác bảng tin.
 *
 * Gom vào một chỗ vì quy tắc "báo cho ai" là thứ dễ sai nhất và phải đọc được
 * liền một mạch: tự báo chính mình, hay báo hai lần cho cùng một người, đều là
 * lỗi chỉ lộ ra khi người dùng đã khó chịu.
 *
 * Mọi hàm ở đây gọi SAU khi dữ liệu đã ghi xong. Đẩy thất bại chỉ làm
 * `pushedDevices` bằng 0 chứ không được làm hỏng việc bình luận.
 */

/**
 * Ngày theo giờ Việt Nam, dạng `YYYY-MM-DD`.
 *
 * Cắt ngày theo UTC thì "lần đầu trong ngày" rơi vào 7 giờ sáng giờ ta —
 * người dùng bày tỏ lúc 6 giờ sáng sẽ bị tính vào hôm qua.
 */
export function vietnamDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function excerpt(body: string, limit = 120): string {
  const trimmed = body.trim();
  if (!trimmed) return 'Đã gửi một ảnh';
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 3)}...` : trimmed;
}

export interface INotifyCommentParams {
  readonly commentId: string;
  readonly postId: string;
  readonly body: string;
  readonly status: CommentStatuses;
  readonly authorId: string;
  readonly postAuthorId: string | null;
  readonly parentAuthorId: string | null;
}

/**
 * Báo khi có bình luận hoặc trả lời.
 *
 * - Bình luận gốc → báo chủ bài.
 * - Trả lời → báo tác giả bình luận cha. Nếu người đó cũng là chủ bài thì CHỈ
 *   một thông báo: hai cái cho cùng một sự kiện là dội bom.
 * - Không bao giờ tự báo chính mình.
 * - Bình luận đang chờ duyệt thì im lặng — nó đang ẩn khỏi công khai, báo là
 *   làm lộ thứ chưa được duyệt.
 */
export async function notifyComment(
  dispatch: IDispatchNotificationUseCase,
  params: INotifyCommentParams,
): Promise<void> {
  if (params.status !== CommentStatuses.VISIBLE) return;

  const isReply = params.parentAuthorId !== null;
  const recipient = isReply ? params.parentAuthorId : params.postAuthorId;

  if (!recipient || recipient === params.authorId) return;

  await dispatch.handle({
    userId: recipient,
    type: isReply
      ? NotificationTypes.CONTENT_COMMENT_REPLIED
      : NotificationTypes.CONTENT_COMMENT_CREATED,
    title: isReply
      ? 'Có người trả lời bình luận của bạn'
      : 'Bài của bạn có bình luận mới',
    body: excerpt(params.body),
    referenceType: 'POST',
    referenceId: params.postId,
    idempotencyKey: `${
      isReply ? 'CONTENT_COMMENT_REPLY' : 'CONTENT_COMMENT'
    }:${params.commentId}`,
  });
}

export interface INotifyReactionParams {
  readonly postId: string;
  readonly postAuthorId: string | null;
  readonly actorId: string;
  /** `false` khi người này chỉ đổi loại cảm xúc — không đáng một thông báo. */
  readonly isNewReaction: boolean;
}

/**
 * Báo LẦN ĐẦU trong ngày rằng bài có người bày tỏ cảm xúc.
 *
 * Khoá chống trùng mang ngày, nên lần thứ hai trở đi trong cùng ngày rơi vào
 * `ON CONFLICT DO NOTHING` và không ghi gì.
 */
export async function notifyFirstReactionOfDay(
  dispatch: IDispatchNotificationUseCase,
  params: INotifyReactionParams,
): Promise<void> {
  if (!params.isNewReaction) return;
  if (!params.postAuthorId || params.postAuthorId === params.actorId) return;

  await dispatch.handle({
    userId: params.postAuthorId,
    type: NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY,
    title: 'Bài của bạn nhận được cảm xúc',
    body: 'Hôm nay có người bày tỏ cảm xúc với bài đăng của bạn.',
    referenceType: 'POST',
    referenceId: params.postId,
    idempotencyKey: `CONTENT_REACTION_FIRST:${params.postId}:${vietnamDateKey()}`,
  });
}
