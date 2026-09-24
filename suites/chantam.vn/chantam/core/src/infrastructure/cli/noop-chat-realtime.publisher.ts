import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import { IChatMessageDto } from '@chantam.vn/chantam.core-lib/dto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Bản không-làm-gì cho tiến trình CLI.
 *
 * Một lần chạy CLI không có socket nào đang mở, nên phát tin realtime là phát
 * vào hư không. Nhưng KHÔNG im lặng: nếu có ngày một CLI thật sự gửi tin nhắn,
 * người vận hành phải thấy ngay rằng người nhận sẽ không nhận được tức thì —
 * họ chỉ thấy tin khi mở lại phòng. Nuốt lặng lẽ là để lỗi đó sống hàng tháng.
 */
@Injectable()
export class NoopChatRealtimePublisher implements IChatRealtimePublisher {
  private readonly logger = new Logger(NoopChatRealtimePublisher.name);

  public async publishMessage(
    roomId: string,
    message: IChatMessageDto,
  ): Promise<void> {
    this.logger.warn(
      `Bỏ qua phát realtime cho phòng ${roomId} (tin ${message.messageId}): ` +
        'tiến trình CLI không giữ kết nối socket nào.',
    );
  }
}
