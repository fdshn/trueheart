import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import { Global, Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

/**
 * Gateway vừa là gateway vừa là hiện thực của `IChatRealtimePublisher`, nên
 * `useExisting` chứ không `useClass`: hai provider riêng sẽ dựng hai thực thể,
 * và thực thể thứ hai không có `@WebSocketServer()` nào được gán.
 */
@Global()
@Module({
  providers: [
    ChatGateway,
    { provide: IChatRealtimePublisher, useExisting: ChatGateway },
  ],
  exports: [IChatRealtimePublisher],
})
export class RealtimeModule {}
