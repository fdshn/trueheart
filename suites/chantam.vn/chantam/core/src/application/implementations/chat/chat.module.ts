import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  IMuteChatRoomUseCase,
  IPurgeExpiredChatsUseCase,
  IReadAdminChatRoomUseCase,
  IRecallChatMessageUseCase,
  IRequestChatMediaUploadUseCase,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { Global, Module } from '@nestjs/common';
import {
  ListChatMessagesUseCase,
  ListChatRoomsUseCase,
  MarkChatRoomReadUseCase,
  MuteChatRoomUseCase,
  PurgeExpiredChatsUseCase,
  RecallChatMessageUseCase,
  RequestChatMediaUploadUseCase,
  SendChatMessageUseCase,
} from './chat.use-cases';
import { ReadAdminChatRoomUseCase } from './read-admin-chat-room.use-case';

@Global()
@Module({
  providers: [
    { provide: IMuteChatRoomUseCase, useClass: MuteChatRoomUseCase },
    { provide: IRecallChatMessageUseCase, useClass: RecallChatMessageUseCase },
    { provide: IReadAdminChatRoomUseCase, useClass: ReadAdminChatRoomUseCase },
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
    IMuteChatRoomUseCase,
    IRecallChatMessageUseCase,
    IReadAdminChatRoomUseCase,
    IListChatRoomsUseCase,
    IListChatMessagesUseCase,
    ISendChatMessageUseCase,
    IMarkChatRoomReadUseCase,
    IPurgeExpiredChatsUseCase,
    IRequestChatMediaUploadUseCase,
  ],
})
export class ChatModule {}
