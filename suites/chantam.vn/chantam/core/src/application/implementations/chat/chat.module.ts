import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  IPurgeExpiredChatsUseCase,
  IRequestChatMediaUploadUseCase,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { Global, Module } from '@nestjs/common';
import {
  ListChatMessagesUseCase,
  ListChatRoomsUseCase,
  MarkChatRoomReadUseCase,
  PurgeExpiredChatsUseCase,
  RequestChatMediaUploadUseCase,
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
    {
      provide: IRequestChatMediaUploadUseCase,
      useClass: RequestChatMediaUploadUseCase,
    },
  ],
  exports: [
    IListChatRoomsUseCase,
    IListChatMessagesUseCase,
    ISendChatMessageUseCase,
    IMarkChatRoomReadUseCase,
    IPurgeExpiredChatsUseCase,
    IRequestChatMediaUploadUseCase,
  ],
})
export class ChatModule {}
