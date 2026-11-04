import {
  ICharityRealtimePublisher,
  IChatRealtimePublisher,
} from '@/domain/ports/realtime';
import { Global, Module } from '@nestjs/common';
import { NoopChatRealtimePublisher } from './noop-chat-realtime.publisher';

/**
 * Bản thay cho `RealtimeModule` trong tiến trình CLI.
 *
 * `@Global()` y như bản thật, và đó là điều BẮT BUỘC chứ không phải tiện tay:
 * `ChatModule` không import module này, nên `exports` thường không tới được
 * chỗ `SendChatMessageUseCase` đang đứng — Nest chỉ tìm trong cây import của
 * chính `ChatModule`.
 *
 * Không nạp `RealtimeModule` thật vì `ChatGateway` dựng một máy chủ websocket
 * cho một tiến trình chạy vài giây rồi thoát, và giữ cổng đó mở đủ lâu để cron
 * chồng lượt là đụng cổng.
 */
@Global()
@Module({
  providers: [
    { provide: IChatRealtimePublisher, useClass: NoopChatRealtimePublisher },
    // Job CLI không giữ socket; tín hiệu dự án từ thiện là gợi ý — bỏ qua im lặng, client
    // vẫn thấy thay đổi qua push và lần gọi REST kế tiếp.
    {
      provide: ICharityRealtimePublisher,
      useValue: { signal: () => undefined },
    },
  ],
  exports: [IChatRealtimePublisher, ICharityRealtimePublisher],
})
export class NoopRealtimeModule {}
