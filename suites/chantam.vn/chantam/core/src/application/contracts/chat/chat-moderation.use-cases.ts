import { IUseCase } from '@chantam/service.common-lib';

export interface IRecallChatMessageCommand {
  roomId: string;
  messageId: string;
  /** Người gọi; phải là người ĐÃ GỬI chính tin đó. */
  userId: string;
  username: string;
}

export interface IRecallChatMessageResult {
  messageId: string;
  recalledAt: Date;
}

export interface IRecallChatMessageUseCase extends IUseCase<
  IRecallChatMessageCommand,
  IRecallChatMessageResult
> {}

export const IRecallChatMessageUseCase = Symbol('IRecallChatMessageUseCase');

export interface IReadAdminChatRoomCommand {
  actorUserId: string;
  roomId: string;
  limit: number;
}

export interface IAdminChatMessageDto {
  messageId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  mediaKeys: string[];
  recalledAt: Date | null;
  sentAt: Date;
}

export interface IReadAdminChatRoomResult {
  roomId: string;
  postId: string;
  giverId: string;
  receiverId: string;
  messages: IAdminChatMessageDto[];
}

export interface IReadAdminChatRoomUseCase extends IUseCase<
  IReadAdminChatRoomCommand,
  IReadAdminChatRoomResult
> {}

export const IReadAdminChatRoomUseCase = Symbol('IReadAdminChatRoomUseCase');
