import {
  IListChatMessagesParamsDto,
  IListChatMessagesQueryDto,
  IListChatMessagesResponseDto,
  IListChatRoomsQueryDto,
  IListChatRoomsResponseDto,
  IMarkChatRoomReadParamsDto,
  IMarkChatRoomReadResponseDto,
  ISendChatMessageBodyDto,
  ISendChatMessageParamsDto,
  ISendChatMessageResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListChatRoomsCommand extends IListChatRoomsQueryDto {
  userId: string;
}

export interface IListChatRoomsResult extends IListChatRoomsResponseDto {}

export interface IListChatRoomsUseCase extends IUseCase<
  IListChatRoomsCommand,
  IListChatRoomsResult
> {}

export const IListChatRoomsUseCase = Symbol('IListChatRoomsUseCase');

export interface IListChatMessagesCommand
  extends IListChatMessagesParamsDto, IListChatMessagesQueryDto {
  userId: string;
}

export interface IListChatMessagesResult extends IListChatMessagesResponseDto {}

export interface IListChatMessagesUseCase extends IUseCase<
  IListChatMessagesCommand,
  IListChatMessagesResult
> {}

export const IListChatMessagesUseCase = Symbol('IListChatMessagesUseCase');

export interface ISendChatMessageCommand
  extends ISendChatMessageParamsDto, ISendChatMessageBodyDto {
  userId: string;
  /**
   * Username của người gửi, lấy từ access token.
   *
   * Người gửi chính là người gọi, nên không cần một truy vấn nữa chỉ để lấy tên
   * điền vào response.
   */
  username: string;
}

export interface ISendChatMessageResult extends ISendChatMessageResponseDto {}

export interface ISendChatMessageUseCase extends IUseCase<
  ISendChatMessageCommand,
  ISendChatMessageResult
> {}

export const ISendChatMessageUseCase = Symbol('ISendChatMessageUseCase');

export interface IMarkChatRoomReadCommand extends IMarkChatRoomReadParamsDto {
  userId: string;
}

export interface IMarkChatRoomReadResult extends IMarkChatRoomReadResponseDto {}

export interface IMarkChatRoomReadUseCase extends IUseCase<
  IMarkChatRoomReadCommand,
  IMarkChatRoomReadResult
> {}

export const IMarkChatRoomReadUseCase = Symbol('IMarkChatRoomReadUseCase');
