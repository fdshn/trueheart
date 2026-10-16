import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import { IAdminMessageRemoval } from '@/domain/ports/repository';
import { IObjectStorage } from '@chantam/service.storage-lib';

/**
 * Việc phải làm SAU khi Admin gỡ một tin đã commit — dùng chung cho gỡ trực
 * tiếp (`RemoveChatMessageUseCase`) và duyệt cờ `MESSAGE_REMOVED`.
 *
 * Ảnh phải biến mất theo. Gỡ chữ mà để ảnh vẫn mở được bằng đường dẫn công khai
 * thì thứ đáng lo nhất vẫn nằm đó — cùng lý lẽ với `recallMessage`.
 *
 * Báo realtime để thiết bị hai bên xoá ngay, không phải chờ tải lại phòng —
 * cùng hình dạng payload mà `RecallChatMessageUseCase` bắn. Không ném nếu
 * thất bại: tin nhắn đã gỡ trong database rồi, và ném ở đây khiến Admin tưởng
 * việc gỡ không thành rồi bấm lại.
 */
export async function announceAdminRemoval(
  storage: IObjectStorage,
  realtime: IChatRealtimePublisher,
  messageId: string,
  removal: IAdminMessageRemoval,
): Promise<void> {
  if (removal.mediaKeys.length > 0)
    await storage.deleteObjects(removal.mediaKeys);

  try {
    await realtime.publishMessage(removal.roomId, {
      messageId,
      roomId: removal.roomId,
      senderId: removal.senderId,
      senderUsername: '',
      body: '',
      mediaKeys: [],
      sentAt: new Date(),
      recalledAt: new Date(),
      isMine: false,
    } as never);
  } catch {
    // Đã gỡ xong; lần tải phòng kế tiếp sẽ thấy đúng trạng thái.
  }
}
