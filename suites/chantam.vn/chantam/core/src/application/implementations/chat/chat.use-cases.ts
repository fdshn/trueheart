import {
  ChatPurgeBatchSize,
  IListChatMessagesCommand,
  IListChatMessagesResult,
  IListChatMessagesUseCase,
  IListChatRoomsCommand,
  IListChatRoomsResult,
  IListChatRoomsUseCase,
  IMarkChatRoomReadCommand,
  IMarkChatRoomReadResult,
  IMarkChatRoomReadUseCase,
  IPurgeExpiredChatsCommand,
  IPurgeExpiredChatsResult,
  IPurgeExpiredChatsUseCase,
  ISendChatMessageCommand,
  ISendChatMessageResult,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  ChatRoomNotFoundException,
  ChatRoomReadOnlyException,
} from '@/domain/exceptions';
import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import { IChatRepository, IChatRoomListItem } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IChatMessageDto,
  IChatRoomSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  clampChatMessageLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '@chantam.vn/chantam.core-lib/models';
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
    purgeAfter: item.room.purgeAfter,
    purgedAt: item.room.purgedAt,
    purgedMessageCount: item.room.purgedMessageCount,
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

    const limit = clampChatMessageLimit(command.limit);
    // Con trỏ hỏng được coi như không có con trỏ, tức trả về cửa sổ mới nhất —
    // thứ người dùng luôn xem được. Ném 400 vì một bookmark cũ thì không.
    const before = decodeKeysetCursor(command.before);
    const after = decodeKeysetCursor(command.after);

    const { items, hasMoreBefore, hasMoreAfter } = await this.chat.listMessages(
      {
        roomId: command.roomId,
        limit,
        before,
        // Truyền cả hai thì `before` thắng: đó là hướng cuộn lên, việc mà người dùng
        // chủ động làm, còn `after` chỉ là việc bắt kịp chạy ngầm.
        after: before ? null : after,
      },
    );

    const oldest = items.at(-1);
    const newest = items.at(0);

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
      window: {
        limit,
        oldestCursor: oldest
          ? encodeKeysetCursor({
              createdAt: oldest.message.createdAt,
              id: oldest.message.id,
            })
          : null,
        newestCursor: newest
          ? encodeKeysetCursor({
              createdAt: newest.message.createdAt,
              id: newest.message.id,
            })
          : null,
        hasMoreBefore,
        hasMoreAfter,
      },
    };
  }
}

@Injectable()
export class SendChatMessageUseCase implements ISendChatMessageUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
    @Inject(IChatRealtimePublisher)
    private readonly realtime: IChatRealtimePublisher,
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

    // Phát SAU khi `appendMessage` đã commit. Phát từ trong transaction rồi
    // rollback là nói với client về một tin nhắn không tồn tại, và không có
    // cách nào rút lại lời đó.
    await this.realtime.publishMessage(command.roomId, message);

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

/**
 * Xoá tin nhắn của những phòng đã quá hạn lưu trữ (F38).
 *
 * Chạy từ lịch NGOÀI tiến trình (`npm run chat:purge`), giống `post:expire` và
 * `rank:evaluate` — repo cố ý không dùng `@nestjs/schedule` vì triển khai nhiều
 * replica sẽ chạy trùng.
 *
 * Làm theo lô có trần thay vì quét sạch một lượt: một `DELETE` ôm hàng trăm nghìn
 * dòng sẽ giữ khoá lâu và chặn đường ghi tin nhắn của những phòng đang mở.
 */
@Injectable()
export class PurgeExpiredChatsUseCase implements IPurgeExpiredChatsUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IPurgeExpiredChatsCommand,
  ): Promise<IPurgeExpiredChatsResult> {
    return this.chat.purgeExpiredRooms(command.limit ?? ChatPurgeBatchSize);
  }
}
