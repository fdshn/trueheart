import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  IPurgeExpiredChatsUseCase,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { Global, Module } from '@nestjs/common';
import {
  ListChatMessagesUseCase,
  ListChatRoomsUseCase,
  MarkChatRoomReadUseCase,
  PurgeExpiredChatsUseCase,
  SendChatMessageUseCase,
} from './chat.use-cases';

@Global()
@Module({
  providers: [
    { provide: IListChatRoomsUseCase, useClass: ListChatRoomsUseCase },
    { provide: IListChatMessagesUseCase, useClass: ListChatMessagesUseCase },
    { provide: ISendChatMessageUseCase, useClass: SendChatMessageUseCase },
    { provide: IMarkChatRoomReadUseCase, useClass: MarkChatRoomReadUseCase },
    { provide: IPurgeExpiredChatsUseCase, useClass: PurgeExpiredChatsUseCase },
  ],
  exports: [
    IListChatRoomsUseCase,
    IListChatMessagesUseCase,
    ISendChatMessageUseCase,
    IMarkChatRoomReadUseCase,
    IPurgeExpiredChatsUseCase,
  ],
})
export class ChatModule {}
