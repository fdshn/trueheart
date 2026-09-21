import { IChatMessageDto } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Phát tin nhắn tới các máy đang mở phòng (F37).
 *
 * **Chỉ được gọi SAU khi transaction đã commit.** Phát từ trong transaction rồi
 * rollback là nói với client về một tin nhắn không tồn tại — và không có cách
 * nào rút lại lời đó.
 *
 * Là port ở tầng domain nên use case không biết gì về Socket.io: đổi cơ chế
 * truyền tin chỉ động vào một adapter.
 */
export interface IChatRealtimePublisher {
  /**
   * Gửi tới mọi máy đang mở phòng, GỒM CẢ người gửi.
   *
   * Người gửi cũng nhận: họ có thể đang mở phòng đó trên hai thiết bị, và bỏ
   * qua họ sẽ làm thiết bị thứ hai thiếu tin.
   */
  publishMessage(roomId: string, message: IChatMessageDto): Promise<void>;
}

export const IChatRealtimePublisher = Symbol('IChatRealtimePublisher');
