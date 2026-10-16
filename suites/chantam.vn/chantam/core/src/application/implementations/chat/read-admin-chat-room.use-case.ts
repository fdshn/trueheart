import {
  IReadAdminChatRoomCommand,
  IReadAdminChatRoomResult,
  IReadAdminChatRoomUseCase,
} from '@/application/contracts/chat';
import { ChatRoomNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IChatRepository,
} from '@/domain/ports/repository';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Dùng chung quyền với hàng đợi báo xấu.
 *
 * Đọc phòng chat chỉ có một lý do chính đáng: điều tra một báo xấu. Nên nó
 * thuộc về người đang xử báo xấu, không phải người quản lý cấu hình.
 */
const ModerationPermission = 'report.read';

/**
 * Cửa sổ của Admin rộng hơn app (30/50): đọc để điều tra cần thấy nhiều ngữ
 * cảnh một lần, nhưng vẫn phải có trần — phòng dài hơn thì cuộn bằng con trỏ.
 */
const DefaultModerationLimit = 50;
const MaxModerationLimit = 200;

function clampModerationLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit))
    return DefaultModerationLimit;
  return Math.min(MaxModerationLimit, Math.max(1, Math.trunc(limit)));
}

/**
 * Admin đọc một phòng chat — chỉ khi có báo xấu đang mở.
 *
 * **Vì sao cần.** Tài liệu lấy chính lịch sử trò chuyện làm lý do giữ phòng thay
 * vì xoá: "bằng chứng khi có tranh chấp". Nhưng trước 28/09 không endpoint nào
 * đọc được nó, kể cả Admin — nên người bị quấy rối báo xấu, Admin mở hàng đợi ra
 * và không có gì để xem ngoài lời khai. Cả kênh tố cáo là trang trí.
 *
 * **Vì sao phải có điều kiện.** Phòng chat là chỗ riêng tư của hai người. Một
 * đường đọc không điều kiện là một cửa đọc trộm mang danh kiểm duyệt. Điều kiện
 * nằm ở repository (`findRoomForModeration`): phải có một báo xấu ĐANG MỞ trỏ
 * vào phòng này. Không có thì trả 404 — giống hệt phòng không tồn tại, nên
 * không ai dò được phòng nào có thật.
 *
 * **Mỗi lần mở đều ghi audit.** Quyền đọc riêng tư mà không để lại vết là quyền
 * không ai kiểm soát được.
 */
@Injectable()
export class ReadAdminChatRoomUseCase implements IReadAdminChatRoomUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IReadAdminChatRoomCommand,
  ): Promise<IReadAdminChatRoomResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        ModerationPermission,
      ))
    )
      throw new ForbiddenException();

    const room = await this.chat.findRoomForModeration(command.roomId);
    if (!room) throw new ChatRoomNotFoundException();

    const limit = clampModerationLimit(command.limit);
    // Con trỏ hỏng coi như không có, cùng lối app: trả cửa sổ mới nhất thay vì
    // ném 400 vào một link CMS cũ.
    const before = decodeKeysetCursor(command.before);
    const after = before ? null : decodeKeysetCursor(command.after);
    const aroundMessageId =
      before || after ? null : (command.aroundMessageId ?? null);

    const { items, hasMoreBefore, hasMoreAfter } =
      await this.chat.listMessagesForModeration({
        roomId: command.roomId,
        limit,
        before,
        after,
        aroundMessageId,
      });

    // Ghi audit SAU khi đã chắc chắn đọc được: ghi trước là để lại vết cho
    // những lần bị từ chối, và hàng nghìn dòng "đã thử đọc" sẽ chôn vùi những
    // lần đọc thật.
    //
    // Ghi ở MỌI trang, không chỉ trang đầu: con trỏ là base64 của (thời điểm,
    // id), ai cũng tự dựng được, nên "chỉ audit lúc mở" là chừa đường đọc cả
    // phòng bằng `before` mà không để lại vết.
    await this.manager.query(
      `
        INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
        VALUES ($1, 'READ_CHAT_ROOM', 'CHAT_ROOM', $2, '{}'::jsonb, $3::jsonb, $4)
      `,
      [
        command.actorUserId,
        command.roomId,
        JSON.stringify({
          messageCount: items.length,
          direction: before
            ? 'BEFORE'
            : after
              ? 'AFTER'
              : aroundMessageId
                ? 'AROUND'
                : 'LATEST',
        }),
        'Điều tra báo xấu đang mở',
      ],
    );

    const base = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    const oldest = items.at(0);
    const newest = items.at(-1);

    return {
      roomId: room.roomId,
      postId: room.postId,
      giverId: room.giverId,
      receiverId: room.receiverId,
      // Key trần thì Admin không xem được ảnh — mà ảnh thường CHÍNH là bằng chứng.
      // Cùng kiểu URL mà người dùng nhận lúc tải ảnh lên (CMS A11).
      messages: items.map(({ id: _id, ...message }) => ({
        ...message,
        mediaUrls: message.mediaKeys.map((key) => `${base}/${key}`),
      })),
      window: {
        limit,
        oldestCursor: oldest
          ? encodeKeysetCursor({ createdAt: oldest.sentAt, id: oldest.id })
          : null,
        newestCursor: newest
          ? encodeKeysetCursor({ createdAt: newest.sentAt, id: newest.id })
          : null,
        hasMoreBefore,
        hasMoreAfter,
      },
    };
  }
}
