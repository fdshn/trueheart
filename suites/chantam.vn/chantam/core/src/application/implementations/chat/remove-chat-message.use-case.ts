import {
  IRemoveChatMessageCommand,
  IRemoveChatMessageResult,
  IRemoveChatMessageUseCase,
} from '@/application/contracts/chat';
import { ChatMessageNotFoundException } from '@/domain/exceptions';
import { IChatRealtimePublisher } from '@/domain/ports/realtime';
import {
  IAdminConfigRepository,
  IChatRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Quyền GỠ, không phải quyền ĐỌC.
 *
 * `report.read` mở hàng đợi và cho xem bằng chứng; gỡ một tin nhắn là một chế tài
 * và đi cùng `report.resolve`. Người phân loại báo xấu không nhất thiết là người
 * được xoá nội dung của người khác.
 */
const RemovalPermission = 'report.resolve';

/**
 * Admin gỡ một tin nhắn bị báo xấu.
 *
 * **Vì sao phải có.** Đợt 28/09 mở hai cửa cho việc báo xấu tin nhắn: báo trỏ đúng
 * một dòng (`CHAT_MESSAGE`), và Admin đọc được phòng làm bằng chứng. Nhưng cửa thứ
 * ba thì không có — nạn nhân báo được, Admin đọc được, bấm RESOLVED được, rồi câu
 * chữ đó vẫn nằm trong phòng vĩnh viễn. `recallMessage` đòi người gọi LÀ người gửi
 * và trong 5 phút, nên nó không phải đường này.
 *
 * Nạn nhân vẫn tắt tiếng phòng được và huỷ lượt trao được mà không bị phạt, nhưng
 * cả hai đều là tránh đi, không phải dọn đi.
 */
@Injectable()
export class RemoveChatMessageUseCase implements IRemoveChatMessageUseCase {
  public constructor(
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IChatRealtimePublisher)
    private readonly realtime: IChatRealtimePublisher,
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async handle(
    command: IRemoveChatMessageCommand,
  ): Promise<IRemoveChatMessageResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        RemovalPermission,
      ))
    )
      throw new ForbiddenException();

    const outcome = await this.chat.removeMessageByAdmin({
      messageId: command.messageId,
    });
    if (outcome.status === 'NOT_FOUND')
      throw new ChatMessageNotFoundException();

    // Ảnh phải biến mất theo. Gỡ chữ mà để ảnh vẫn mở được bằng đường dẫn công
    // khai thì thứ đáng lo nhất vẫn nằm đó — cùng lý lẽ với `recallMessage`.
    if (outcome.mediaKeys.length > 0)
      await this.storage.deleteObjects(outcome.mediaKeys);

    // Báo realtime để thiết bị hai bên xoá ngay, không phải chờ tải lại phòng —
    // cùng hình dạng payload mà `RecallChatMessageUseCase` bắn.
    //
    // Không ném nếu thất bại: tin nhắn đã gỡ trong database rồi, và ném ở đây
    // khiến Admin tưởng việc gỡ không thành rồi bấm lại.
    try {
      await this.realtime.publishMessage(outcome.roomId, {
        messageId: command.messageId,
        roomId: outcome.roomId,
        senderId: outcome.senderId,
        senderUsername: '',
        body: '',
        mediaKeys: [],
        sentAt: new Date(),
        recalledAt: new Date(),
        isMine: false,
      } as never);
    } catch {
      // Đã gỡ xong; lần tải phòng kế tiếp sẽ thấy đúng trạng thái.
    }

    await this.manager.query(
      `
        INSERT INTO admin_audit_logs
          (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
        VALUES ($1, 'REMOVE_CHAT_MESSAGE', 'CHAT_MESSAGE', $2, '{}'::jsonb, $3::jsonb, $4)
      `,
      [
        command.actorUserId,
        command.messageId,
        JSON.stringify({
          roomId: outcome.roomId,
          senderId: outcome.senderId,
          mediaRemoved: outcome.mediaKeys.length,
        }),
        command.reason,
      ],
    );

    return { messageId: command.messageId, roomId: outcome.roomId };
  }
}
