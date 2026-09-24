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
  IRequestChatMediaUploadCommand,
  IRequestChatMediaUploadResult,
  IRequestChatMediaUploadUseCase,
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
import {
  MaxContentMediaPerItem,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
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
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProfileGate } from '../profile/profile-gate';

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
      messages: items.map(({ message, senderUsername, mediaKeys }) => ({
        messageId: message.globalId,
        roomId: message.roomId,
        senderId: message.senderId,
        senderUsername,
        body: message.body,
        mediaKeys,
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

/**
 * Xem trước cho thông báo đẩy.
 *
 * Cắt bớt để thông báo không thành một bản sao cả đoạn chat trên màn khoá, và
 * nói rõ khi tin chỉ có ảnh — một thông báo rỗng trông như lỗi.
 */
function notificationPreview(body: string, mediaCount: number): string {
  if (!body)
    return mediaCount > 1 ? `Đã gửi ${mediaCount} ảnh` : 'Đã gửi một ảnh';
  const preview = body.length > 120 ? `${body.slice(0, 117)}...` : body;
  return mediaCount > 0 ? `${preview} (kèm ảnh)` : preview;
}

@Injectable()
export class SendChatMessageUseCase implements ISendChatMessageUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
    @Inject(IChatRealtimePublisher)
    private readonly realtime: IChatRealtimePublisher,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    private readonly profileGate: ProfileGate,
  ) {}

  public async handle(
    command: ISendChatMessageCommand,
  ): Promise<ISendChatMessageResult> {
    // Cổng hồ sơ (F07) — chốt 2026-09-24 áp cho cả chat. Đặt ở đường GỬI chứ
    // không ở đường đọc: người hồ sơ chưa đủ vẫn phải đọc được tin nhắn gửi
    // cho mình, nếu không họ mất luôn lời nhắn đang chờ.
    await this.profileGate.assertComplete(command.userId);

    const body = command.message.body.trim();
    const mediaKeys = (command.message.mediaKeys ?? []).slice(
      0,
      MaxContentMediaPerItem,
    );

    // Tin phải có CHỮ hoặc ẢNH. Database cũng chặn, nhưng chặn ở đây cho ra
    // thông báo đọc được thay vì một lỗi ràng buộc 500.
    if (!body && mediaKeys.length === 0)
      throw new ValidationFailedException([
        'message.body: phải có nội dung hoặc ít nhất một ảnh',
      ]);

    // Object phải CÓ THẬT trên storage trước khi ghi: một chuỗi key bịa ra sẽ
    // thành tin nhắn mang ảnh trỏ vào hư không, và chat chỉ ghi thêm nên không
    // sửa lại được.
    for (const key of mediaKeys)
      await this.storage.confirmChatMediaUpload(
        command.userId,
        command.roomId,
        key,
      );

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
      mediaKeys,
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
      body: notificationPreview(body, mediaKeys.length),
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
      mediaKeys,
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
/**
 * Cấp đường tải ảnh cho một tin nhắn chưa tồn tại.
 *
 * Khoá theo PHÒNG chứ không theo tin nhắn: chat chỉ ghi thêm nên tin được tạo
 * cùng lúc với ảnh, lúc xin đường tải nó chưa có.
 *
 * Kiểm tư cách thành viên TRƯỚC khi ký: thiếu phép kiểm này thì bất kỳ ai cũng
 * xin được đường ghi vào không gian của một phòng họ không thuộc về.
 */
@Injectable()
export class RequestChatMediaUploadUseCase implements IRequestChatMediaUploadUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestChatMediaUploadCommand,
  ): Promise<IRequestChatMediaUploadResult> {
    const room = await this.chat.findRoomForParticipant(
      command.roomId,
      command.userId,
    );
    if (!room) throw new ChatRoomNotFoundException();

    const upload = await this.storage.createChatMediaUpload({
      userId: command.userId,
      roomId: command.roomId,
      contentType: command.contentType,
      contentLength: command.contentLength,
    });

    return { upload };
  }
}

@Injectable()
export class PurgeExpiredChatsUseCase implements IPurgeExpiredChatsUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IPurgeExpiredChatsCommand,
  ): Promise<IPurgeExpiredChatsResult> {
    const { purgedRooms, purgedMessages, mediaKeys } =
      await this.chat.purgeExpiredRooms(command.limit ?? ChatPurgeBatchSize);

    // SAU khi transaction đã commit. Lời hứa "tin nhắn sẽ được xoá" chỉ đúng
    // một nửa nếu chữ biến mất còn ảnh vẫn mở được bằng đường dẫn công khai.
    const purgedMedia = await this.storage.deleteObjects(mediaKeys);

    return { purgedRooms, purgedMessages, purgedMedia };
  }
}
