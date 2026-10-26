import {
  IListChatMessagesUseCase,
  IListChatRoomsUseCase,
  IMarkChatRoomReadUseCase,
  IMuteChatRoomUseCase,
  IOpenDirectPostRoomUseCase,
  IPurgeExpiredChatsUseCase,
  IReadAdminChatRoomUseCase,
  IRecallChatMessageUseCase,
  IRemoveChatMessageUseCase,
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
import { OpenDirectPostRoomUseCase } from './open-direct-post-room.use-case';
import { ReadAdminChatRoomUseCase } from './read-admin-chat-room.use-case';
import { RemoveChatMessageUseCase } from './remove-chat-message.use-case';

@Global()
@Module({
  providers: [
    { provide: IMuteChatRoomUseCase, useClass: MuteChatRoomUseCase },
    { provide: IRecallChatMessageUseCase, useClass: RecallChatMessageUseCase },
    { provide: IReadAdminChatRoomUseCase, useClass: ReadAdminChatRoomUseCase },
    { provide: IListChatRoomsUseCase, useClass: ListChatRoomsUseCase },
    {
      provide: IOpenDirectPostRoomUseCase,
      useClass: OpenDirectPostRoomUseCase,
    },
    { provide: IListChatMessagesUseCase, useClass: ListChatMessagesUseCase },
    { provide: ISendChatMessageUseCase, useClass: SendChatMessageUseCase },
    { provide: IMarkChatRoomReadUseCase, useClass: MarkChatRoomReadUseCase },
    { provide: IPurgeExpiredChatsUseCase, useClass: PurgeExpiredChatsUseCase },
    {
      provide: IRequestChatMediaUploadUseCase,
      useClass: RequestChatMediaUploadUseCase,
    },
    {
      provide: IRemoveChatMessageUseCase,
      useClass: RemoveChatMessageUseCase,
    },
  ],
  exports: [
    IMuteChatRoomUseCase,
    IRecallChatMessageUseCase,
    IReadAdminChatRoomUseCase,
    IRemoveChatMessageUseCase,
    IListChatRoomsUseCase,
    IOpenDirectPostRoomUseCase,
    IListChatMessagesUseCase,
    ISendChatMessageUseCase,
    IMarkChatRoomReadUseCase,
    IPurgeExpiredChatsUseCase,
    IRequestChatMediaUploadUseCase,
  ],
})
export class ChatModule {}
