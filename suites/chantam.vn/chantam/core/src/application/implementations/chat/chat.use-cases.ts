import {
  IListChatMessagesCommand,
  IListChatMessagesResult,
  IListChatMessagesUseCase,
  IListChatRoomsCommand,
  IListChatRoomsResult,
  IListChatRoomsUseCase,
  IMarkChatRoomReadCommand,
  IMarkChatRoomReadResult,
  IMarkChatRoomReadUseCase,
  ISendChatMessageCommand,
  ISendChatMessageResult,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  ChatRoomNotFoundException,
  ChatRoomReadOnlyException,
} from '@/domain/exceptions';
import { IChatRepository, IChatRoomListItem } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IChatMessageDto,
  IChatRoomSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

function toRoomSummary(item: IChatRoomListItem): IChatRoomSummaryDto {
  return {
    roomId: item.room.globalId,
    transactionId: item.room.transactionId,
    postId: item.room.postId,
    postTitle: item.postTitle,
    status: item.room.status,
    counterpartUsername: item.counterpartUsername,
    counterpartFullName: item.counterpartFullName,
    lastMessageAt: item.room.lastMessageAt,
    lastMessageBody: item.lastMessageBody,
    unreadCount: item.unreadCount,
  };
}

@Injectable()
export class ListChatRoomsUseCase implements IListChatRoomsUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IListChatRoomsCommand,
  ): Promise<IListChatRoomsResult> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.chat.listRoomsForUser({
      userId: command.userId,
      skip,
      take,
    });

    return {
      rooms: items.map(toRoomSummary),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class ListChatMessagesUseCase implements IListChatMessagesUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IListChatMessagesCommand,
  ): Promise<IListChatMessagesResult> {
    // `describeRoom` vừa lấy dữ liệu vừa là phép kiểm quyền: nó chỉ trả về
    // phòng mà người gọi là một trong hai bên.
    const room = await this.chat.describeRoom(command.roomId, command.userId);
    if (!room) throw new ChatRoomNotFoundException();

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.chat.listMessages({
      roomId: command.roomId,
      skip,
      take,
    });

    return {
      room: toRoomSummary(room),
      messages: items.map(({ message, senderUsername }) => ({
        messageId: message.globalId,
        roomId: message.roomId,
        senderId: message.senderId,
        senderUsername,
        body: message.body,
        sentAt: message.createdAt,
        isMine: message.senderId === command.userId,
      })),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class SendChatMessageUseCase implements ISendChatMessageUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: ISendChatMessageCommand,
  ): Promise<ISendChatMessageResult> {
    const body = command.message.body.trim();

    const outcome = await this.chat.appendMessage({
      // Id NGẪU NHIÊN, không phải `makeGlobalId`: hàm đó là UUID v5 tiền định,
      // nên hai tin cùng nội dung gửi trong cùng một mili-giây sẽ ra cùng một
      // id và lần ghi thứ hai nổ ràng buộc duy nhất. Ở `gift-request` tính
      // tiền định là cố ý — nó CHÍNH LÀ cơ chế chống trùng; ở đây thì không,
      // gửi "ok" hai lần là hai tin nhắn khác nhau.
      globalId: randomUUID(),
      roomId: command.roomId,
      senderId: command.userId,
      body,
    });

    if (outcome.status === 'READ_ONLY') throw new ChatRoomReadOnlyException();
    if (outcome.status !== 'APPENDED') throw new ChatRoomNotFoundException();

    // Thông báo là việc SAU khi tin đã lưu, và có khoá chống trùng theo id tin
    // nhắn — retry không làm rung điện thoại hai lần. Lỗi ở đây không được
    // huỷ tin nhắn đã gửi thành công, nên use case kia tự nuốt lỗi đẩy.
    await this.dispatchNotification.handle({
      userId: outcome.counterpartId,
      type: NotificationTypes.NEW_CHAT_MESSAGE,
      title: 'Bạn có tin nhắn mới',
      // Cắt bớt để thông báo không thành một bản sao cả đoạn chat trên màn khoá.
      body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
      referenceType: 'CHAT_ROOM',
      referenceId: command.roomId,
      idempotencyKey: `NEW_CHAT_MESSAGE:${outcome.message.globalId}`,
    });

    const message: IChatMessageDto = {
      messageId: outcome.message.globalId,
      roomId: outcome.message.roomId,
      senderId: outcome.message.senderId,
      senderUsername: command.username,
      body: outcome.message.body,
      sentAt: outcome.message.createdAt,
      isMine: true,
    };

    return { message };
  }
}

@Injectable()
export class MarkChatRoomReadUseCase implements IMarkChatRoomReadUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IMarkChatRoomReadCommand,
  ): Promise<IMarkChatRoomReadResult> {
    const marked = await this.chat.markRead(command.roomId, command.userId);
    if (!marked) throw new ChatRoomNotFoundException();

    return {
      roomId: command.roomId,
      readAt: marked.readAt,
      unreadCount: marked.unreadCount,
    };
  }
}
