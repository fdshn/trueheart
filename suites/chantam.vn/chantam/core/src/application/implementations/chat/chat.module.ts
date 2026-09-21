import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { Global, Module } from '@nestjs/common';
import {
  ListChatMessagesUseCase,
  ListChatRoomsUseCase,
  MarkChatRoomReadUseCase,
  SendChatMessageUseCase,
} from './chat.use-cases';

@Global()
@Module({
  providers: [
    { provide: IListChatRoomsUseCase, useClass: ListChatRoomsUseCase },
    { provide: IListChatMessagesUseCase, useClass: ListChatMessagesUseCase },
    { provide: ISendChatMessageUseCase, useClass: SendChatMessageUseCase },
    { provide: IMarkChatRoomReadUseCase, useClass: MarkChatRoomReadUseCase },
  ],
  exports: [
    IListChatRoomsUseCase,
    IListChatMessagesUseCase,
    ISendChatMessageUseCase,
    IMarkChatRoomReadUseCase,
  ],
})
export class ChatModule {}
