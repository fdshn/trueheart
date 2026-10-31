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
  /** Mặc định 50, trần 200. */
  limit?: number;
  /** Lấy các tin CŨ HƠN con trỏ — cuộn lên. Thắng `after` và `aroundMessageId`. */
  before?: string;
  /** Lấy các tin MỚI HƠN con trỏ — cuộn xuống. Thắng `aroundMessageId`. */
  after?: string;
  /** Mở cửa sổ quanh đúng tin này — đi thẳng từ báo xấu `CHAT_MESSAGE`. */
  aroundMessageId?: string;
}

export interface IAdminChatMessageWindow {
  limit: number;
  /** Truyền vào `before` để tải tin cũ hơn. `null` khi cửa sổ rỗng. */
  oldestCursor: string | null;
  /** Truyền vào `after` để tải tin mới hơn. `null` khi cửa sổ rỗng. */
  newestCursor: string | null;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface IAdminChatMessageDto {
  messageId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  mediaKeys: string[];
  /** URL mở được của từng ảnh, cùng thứ tự với `mediaKeys`. */
  mediaUrls: string[];
  recalledAt: Date | null;
  sentAt: Date;
}

export interface IReadAdminChatRoomResult {
  roomId: string;
  /** `null` với phòng `DIRECT_USER`. */
  postId: string | null;
  giverId: string;
  receiverId: string;
  /** Cũ nhất trước — Admin đọc cuộc trao đổi từ trên xuống. */
  messages: IAdminChatMessageDto[];
  window: IAdminChatMessageWindow;
}

export interface IReadAdminChatRoomUseCase extends IUseCase<
  IReadAdminChatRoomCommand,
  IReadAdminChatRoomResult
> {}

export const IReadAdminChatRoomUseCase = Symbol('IReadAdminChatRoomUseCase');

export interface IMuteChatRoomCommand {
  roomId: string;
  userId: string;
  muted: boolean;
}

export interface IMuteChatRoomResult {
  roomId: string;
  muted: boolean;
}

export interface IMuteChatRoomUseCase extends IUseCase<
  IMuteChatRoomCommand,
  IMuteChatRoomResult
> {}

export const IMuteChatRoomUseCase = Symbol('IMuteChatRoomUseCase');

export interface IRemoveChatMessageCommand {
  actorUserId: string;
  messageId: string;
  /** Bắt buộc — đây là quyết định sẽ bị hỏi lại. */
  reason: string;
}

export interface IRemoveChatMessageResult {
  messageId: string;
  roomId: string;
}

export interface IRemoveChatMessageUseCase extends IUseCase<
  IRemoveChatMessageCommand,
  IRemoveChatMessageResult
> {}

export const IRemoveChatMessageUseCase = Symbol('IRemoveChatMessageUseCase');
