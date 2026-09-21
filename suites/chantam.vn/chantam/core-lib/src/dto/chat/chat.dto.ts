import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { ChatRoomStatuses } from '../../consts';

export interface IChatRoomSummaryDto {
  roomId: string;
  transactionId: string;
  postId: string;
  postTitle: string;
  status: ChatRoomStatuses;
  /** Người còn lại trong phòng — giao diện cần tên để hiển thị hội thoại. */
  counterpartUsername: string;
  counterpartFullName: string | null;
  lastMessageAt: Date | null;
  lastMessageBody: string | null;
  /**
   * Số tin chưa đọc của CHÍNH người gọi.
   *
   * Không đếm tin do họ gửi — tin mình vừa gửi hiện thành "chưa đọc" là một con
   * số vô nghĩa trên giao diện.
   */
  unreadCount: number;
}

export interface IListChatRoomsQueryDto extends IPaginationQueryDto {}

export interface IListChatRoomsResponseDto {
  rooms: IChatRoomSummaryDto[];
  meta: IPaginationMetaDto;
}

export interface IChatMessageDto {
  messageId: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  sentAt: Date;
  /** Tin do chính người gọi gửi — giao diện xếp sang phải. */
  isMine: boolean;
}

export interface IListChatMessagesParamsDto {
  roomId: string;
}

export interface IListChatMessagesQueryDto extends IPaginationQueryDto {}

export interface IListChatMessagesResponseDto {
  room: IChatRoomSummaryDto;
  messages: IChatMessageDto[];
  meta: IPaginationMetaDto;
}

export interface ISendChatMessageParamsDto {
  roomId: string;
}

export interface ISendChatMessageDto {
  body: string;
}

export interface ISendChatMessageBodyDto {
  message: ISendChatMessageDto;
}

export interface ISendChatMessageResponseDto {
  message: IChatMessageDto;
}

export interface IMarkChatRoomReadParamsDto {
  roomId: string;
}

export interface IMarkChatRoomReadResponseDto {
  roomId: string;
  readAt: Date;
  unreadCount: number;
}
