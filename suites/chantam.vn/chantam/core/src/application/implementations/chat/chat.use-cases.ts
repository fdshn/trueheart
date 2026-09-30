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
  IMuteChatRoomCommand,
  IMuteChatRoomResult,
  IMuteChatRoomUseCase,
  IPurgeExpiredChatsCommand,
  IPurgeExpiredChatsResult,
  IPurgeExpiredChatsUseCase,
  IRecallChatMessageCommand,
  IRecallChatMessageResult,
  IRecallChatMessageUseCase,
  IRequestChatMediaUploadCommand,
  IRequestChatMediaUploadResult,
  IRequestChatMediaUploadUseCase,
  ISendChatMessageCommand,
  ISendChatMessageResult,
  ISendChatMessageUseCase,
} from '@/application/contracts/chat';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  ChatMessageNotFoundException,
  ChatRecallWindowClosedException,
  ChatRoomNotFoundException,
  ChatRoomReadOnlyException,
} from '@/domain/exceptions';
import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  IChatRepository,
  IChatRoomListItem,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  ChatRecallWindowMinutes,
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
  ModerationTermsConfigKey,
  ModerationVerdicts,
  normalizeBlockedTerms,
  screenText,
} from '@chantam.vn/chantam.core-lib/models';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProfileGate } from '../profile/profile-gate';
import { withStorageValidation } from '../shared/storage-error';

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

/**
 * Trần gửi tin theo phút — chặn TỐC ĐỘ.
 *
 * Nặng hơn trần bình luận ở một điểm: mỗi tin nhắn bắn MỘT thông báo
 * `NEW_CHAT_MESSAGE` tới người kia, và khoá chống trùng theo id tin nên không
 * gộp được. Một nghìn tin là một nghìn lần rung máy.
 *
 * Ba mươi cái một phút rộng hơn hẳn nhịp gõ của người thật đang mặc cả chỗ hẹn.
 */
const MaxMessagesPerMinute = 30;

/**
 * Trần gửi tin theo NGÀY — chặn TỔNG.
 *
 * Trần phút một mình vẫn cho 43.200 tin mỗi ngày. Năm trăm rộng gấp nhiều lần
 * một cuộc trao đổi thật, kể cả cuộc dài nhất.
 */
const MaxMessagesPerDay = 500;

/** Cửa sổ tính từ tin ĐẦU TIÊN của đợt, không phải từ 0 giờ. */
const DayWindowSeconds = 86_400;

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
    @Inject(IRequestThrottle)
    private readonly throttle: IRequestThrottle,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISendChatMessageCommand,
  ): Promise<ISendChatMessageResult> {
    // Cổng hồ sơ (F07) — chốt 2026-09-24 áp cho cả chat. Đặt ở đường GỬI chứ
    // không ở đường đọc: người hồ sơ chưa đủ vẫn phải đọc được tin nhắn gửi
    // cho mình, nếu không họ mất luôn lời nhắn đang chờ.
    await this.profileGate.assertComplete(command.userId);

    // Hỏi trần NGÀY trước trần PHÚT: chạm cả hai mà báo "thử lại sau 12 giây"
    // là nói sai — thật ra còn phải chờ nhiều giờ nữa.
    await this.throttle.assertWithinLimit({
      bucket: 'chat:day',
      key: command.userId,
      limit: MaxMessagesPerDay,
    });
    await this.throttle.assertWithinLimit({
      bucket: 'chat',
      key: command.userId,
      limit: MaxMessagesPerMinute,
    });

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
      await withStorageValidation('message.mediaKeys', () =>
        this.storage.confirmChatMediaUpload(
          command.userId,
          command.roomId,
          key,
        ),
      );

    // Sàng từ ngữ, GẮN CỜ chứ không chặn (chốt Bên A 30/09).
    //
    // Tới 30/09 `screenText` chỉ chạy trên bình luận — một kênh công khai — trong
    // khi mọi thương lượng diễn ra ở chat. Nên 14 mục dấu hiệu lừa đảo và 8 mục
    // kéo ra ngoài nền tảng đang canh đúng chỗ không cần canh.
    //
    // Không chặn vì chat là hội thoại riêng giữa hai người đang bàn giao món đồ,
    // và một dương tính giả ở đây làm đứng cả việc: "đặt cọc" trong câu "mình
    // không cần đặt cọc gì đâu" khớp y như trong câu của kẻ lừa. Máy không phân
    // biệt được, người thì được — nên việc của máy là đưa nó tới người.
    //
    // Cấu hình hỏng hoặc rỗng thì `screenText` trả ALLOW, tức không cờ nào. Fail
    // OPEN là cố ý ở đây: một dòng JSON gõ nhầm không được biến thành "mọi tin
    // nhắn đều vào hàng đợi Admin".
    const screening = screenText(
      body,
      normalizeBlockedTerms(
        await this.adminConfig.getConfigValue(ModerationTermsConfigKey),
      ),
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
      flag:
        screening.verdict === ModerationVerdicts.ALLOW
          ? undefined
          : {
              // `verdict` chứ không `severity` của từng mục: `screenText` đã gộp
              // "mục nặng nhất thắng", và tính lại ở đây là hai chỗ cùng quyết một
              // việc.
              severity: screening.verdict,
              matchedTerms: screening.matched,
            },
    });

    if (outcome.status === 'READ_ONLY') throw new ChatRoomReadOnlyException();
    if (outcome.status !== 'APPENDED') throw new ChatRoomNotFoundException();

    // Thông báo là việc SAU khi tin đã lưu, và có khoá chống trùng theo id tin
    // nhắn — retry không làm rung điện thoại hai lần. Lỗi ở đây không được
    // huỷ tin nhắn đã gửi thành công, nên use case kia tự nuốt lỗi đẩy.
    //
    // Bên kia đã tắt thông báo phòng này thì KHÔNG gửi. Tin vẫn tới nơi và vẫn
    // vào danh sách hội thoại — chỉ là không kêu. Đó đúng là thứ người bị làm
    // phiền cần khi họ vẫn muốn nhận món đồ.
    if (!outcome.counterpartMuted)
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

    // Đếm SAU khi tin đã lưu: đếm trước là trừ mất một suất cho một tin bị từ
    // chối vì phòng đã khoá — tức phạt người dùng vì thứ chưa bao giờ gửi được.
    for (const [bucket, windowSeconds] of [
      ['chat', 60],
      ['chat:day', DayWindowSeconds],
    ] as [string, number][])
      await this.throttle.registerHit({
        bucket,
        key: command.userId,
        windowSeconds,
      });

    return { message };
  }
}

/**
 * Thu hồi một tin nhắn vừa gửi.
 *
 * Đây là nơi hai bên trao số điện thoại và địa chỉ thật, nên dán nhầm vào phòng
 * khác là chuyện sẽ xảy ra — và trước 28/09 không gỡ được kể cả một giây sau.
 *
 * **Không xoá dòng.** Bảng tin nhắn cấm sửa/xoá để không ai âm thầm viết lại
 * lịch sử trao đổi, và chính lịch sử đó là bằng chứng khi có tranh chấp. Thu
 * hồi chỉ làm RỖNG nội dung và đặt `recalled_at`; dòng vẫn giữ chỗ trong cuộc
 * trò chuyện, nên ai đọc lại vẫn thấy "ở đây từng có một tin".
 */
@Injectable()
export class RecallChatMessageUseCase implements IRecallChatMessageUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IChatRealtimePublisher)
    private readonly realtime: IChatRealtimePublisher,
  ) {}

  public async handle(
    command: IRecallChatMessageCommand,
  ): Promise<IRecallChatMessageResult> {
    const outcome = await this.chat.recallMessage({
      roomId: command.roomId,
      messageId: command.messageId,
      senderId: command.userId,
      windowMinutes: ChatRecallWindowMinutes,
    });

    if (outcome.status === 'NOT_FOUND')
      throw new ChatMessageNotFoundException();
    if (outcome.status === 'WINDOW_CLOSED')
      throw new ChatRecallWindowClosedException(ChatRecallWindowMinutes);

    // Ảnh phải biến mất theo. Thu hồi mà để ảnh vẫn mở được bằng đường dẫn công
    // khai thì chữ biến mất còn thứ đáng lo nhất vẫn nằm đó.
    if (outcome.mediaKeys.length > 0)
      await this.storage.deleteObjects(outcome.mediaKeys);

    // Báo realtime để thiết bị bên kia xoá ngay, không phải chờ tải lại phòng.
    await this.realtime.publishMessage(command.roomId, {
      messageId: command.messageId,
      roomId: command.roomId,
      senderId: command.userId,
      senderUsername: command.username,
      body: '',
      mediaKeys: [],
      sentAt: outcome.sentAt,
      recalledAt: outcome.recalledAt,
      isMine: true,
    } as never);

    return { messageId: command.messageId, recalledAt: outcome.recalledAt };
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

/**
 * Bật/tắt thông báo của một phòng chat.
 *
 * Trước 28/09, người bị làm phiền giữa chừng chỉ có một cửa thoát: huỷ lượt
 * trao. Nó khoá phòng ngay, nhưng cũng bỏ luôn món đồ họ đang chờ — và tính một
 * lượt huỷ vào đầu chính họ. Tắt thông báo là cửa nhẹ hơn cho người vẫn muốn
 * nhận: im lặng mà không mất lượt.
 */
@Injectable()
export class MuteChatRoomUseCase implements IMuteChatRoomUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IMuteChatRoomCommand,
  ): Promise<IMuteChatRoomResult> {
    const updated = await this.chat.setRoomMuted({
      roomId: command.roomId,
      userId: command.userId,
      muted: command.muted,
    });

    // Không ở trong phòng thì 404, giống hệt phòng không tồn tại: trả lời khác
    // nhau cho hai trường hợp là cho người lạ dò được giao dịch nào có thật.
    if (!updated) throw new ChatRoomNotFoundException();

    return { roomId: command.roomId, muted: command.muted };
  }
}
