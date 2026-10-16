import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

/**
 * Gộp cả "phòng không tồn tại" với "phòng của người khác".
 *
 * Trả lời khác nhau cho hai trường hợp là cho người lạ dò được giao dịch nào
 * có thật — và ai đang trao đổi với ai.
 */
export class ChatRoomNotFoundException extends ExceptionFrom(
  CoreErrors.CHAT_ROOM_NOT_FOUND,
) {}

export class ChatRoomReadOnlyException extends ExceptionFrom(
  CoreErrors.CHAT_ROOM_READ_ONLY,
) {}

export class ChatMessageNotFoundException extends ExceptionFrom(
  CoreErrors.CHAT_MESSAGE_NOT_FOUND,
) {}

/**
 * Hết cửa sổ thu hồi.
 *
 * Dài hơn thì thu hồi thành công cụ viết lại cuộc trao đổi sau khi bên kia đã
 * đọc và đã hành động theo nó — mà chính lịch sử đó là bằng chứng khi tranh chấp.
 */
export class ChatRecallWindowClosedException extends ExceptionFrom(
  CoreErrors.CHAT_RECALL_WINDOW_CLOSED,
) {}

export class NotificationNotFoundException extends ExceptionFrom(
  CoreErrors.NOTIFICATION_NOT_FOUND,
) {}

export class ChatFlagAlreadyReviewedException extends ExceptionFrom(
  CoreErrors.CHAT_FLAG_ALREADY_REVIEWED,
) {}

export class NotificationBroadcastNotFoundException extends ExceptionFrom(
  CoreErrors.NOTIFICATION_BROADCAST_NOT_FOUND,
) {}

export class NotificationBroadcastAlreadyCompletedException extends ExceptionFrom(
  CoreErrors.NOTIFICATION_BROADCAST_ALREADY_COMPLETED,
) {}

export class NotificationBroadcastInProgressException extends ExceptionFrom(
  CoreErrors.NOTIFICATION_BROADCAST_IN_PROGRESS,
) {}
