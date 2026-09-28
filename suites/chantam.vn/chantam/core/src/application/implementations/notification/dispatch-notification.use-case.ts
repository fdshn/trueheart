import {
  IDispatchNotificationCommand,
  IDispatchNotificationResult,
  IDispatchNotificationUseCase,
} from '@/application/contracts/notification';
import { IPushSender } from '@/domain/ports/notification';
import {
  INotificationRepository,
  INotificationTemplateRepository,
} from '@/domain/ports/repository';
import { NotificationGroupOf } from '@chantam.vn/chantam.core-lib/consts';
import { renderNotificationTemplate } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class DispatchNotificationUseCase implements IDispatchNotificationUseCase {
  private readonly logger = new Logger(DispatchNotificationUseCase.name);

  public constructor(
    @Inject(INotificationRepository)
    private readonly notifications: INotificationRepository,
    @Inject(IPushSender)
    private readonly pushSender: IPushSender,
    @Inject(INotificationTemplateRepository)
    private readonly templates: INotificationTemplateRepository,
  ) {}

  public async handle(
    command: IDispatchNotificationCommand,
  ): Promise<IDispatchNotificationResult> {
    const { title, body } = await this.resolveContent(command);

    const created = await this.notifications.create({
      // Chống trùng là việc của `idempotencyKey` (UNIQUE ở database), không
      // phải của id. Nếu id cũng tiền định thì hai thông báo hợp lệ khác nhau
      // mà thiếu `idempotencyKey` sẽ đụng nhau ở id.
      globalId: randomUUID(),
      userId: command.userId,
      type: command.type,
      title,
      body,
      referenceType: command.referenceType ?? null,
      referenceId: command.referenceId ?? null,
      idempotencyKey: command.idempotencyKey ?? null,
    });

    // Trùng khoá nghĩa là đã thông báo lần trước rồi. Đẩy lại là làm điện thoại
    // người dùng rung hai lần cho cùng một việc.
    if (!created) return { created: false, pushedDevices: 0 };

    // Tắt một nhóm chỉ tắt TIẾNG CHUÔNG, không tắt bản ghi: thông báo vẫn nằm
    // trong hộp thư để người dùng tự vào xem. Bỏ luôn bản ghi thì họ mất hẳn
    // thông tin, chứ không phải được yên tĩnh — cùng lối nghĩ với việc tắt
    // thông báo một phòng chat.
    if (await this.isGroupMuted(command))
      return { created: true, pushedDevices: 0 };

    const pushedDevices = await this.push(created.globalId, command);
    return { created: true, pushedDevices };
  }

  /**
   * Người nhận đã tắt nhóm chứa loại thông báo này chưa.
   *
   * Đọc hỏng thì coi như CHƯA tắt: mất một lần yên tĩnh còn hơn nuốt mất một
   * thông báo người dùng đang chờ. Cùng lối xử lý với việc đọc mẫu ở dưới.
   */
  private async isGroupMuted(
    command: IDispatchNotificationCommand,
  ): Promise<boolean> {
    try {
      const muted = await this.notifications.listMutedGroups(command.userId);
      if (muted.length === 0) return false;

      return muted.includes(NotificationGroupOf[command.type]);
    } catch (error) {
      this.logger.warn(
        `Không đọc được cài đặt thông báo của ${command.userId}, coi như chưa tắt: ${String(error)}`,
      );
      return false;
    }
  }

  /**
   * Chữ hiện ra: ưu tiên mẫu Admin đang bật, không có thì dùng chữ nơi gọi dựng.
   *
   * Đọc mẫu KHÔNG được làm hỏng việc gửi: mẫu là tiện nghi vận hành, còn thông
   * báo là thứ người dùng đang chờ. Database mẫu hỏng thì gửi bản mặc định chứ
   * không nuốt luôn thông báo.
   */
  private async resolveContent(
    command: IDispatchNotificationCommand,
  ): Promise<{ title: string; body: string }> {
    try {
      const template = await this.templates.findEnabled(command.type);
      if (!template) return { title: command.title, body: command.body };

      const variables = command.variables ?? {};
      return {
        title: renderNotificationTemplate(template.title, variables),
        body: renderNotificationTemplate(template.body, variables),
      };
    } catch (error) {
      this.logger.warn(
        `Không đọc được mẫu thông báo ${command.type}, dùng bản mặc định: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { title: command.title, body: command.body };
    }
  }

  /**
   * Cố đẩy xuống thiết bị. **Không bao giờ ném lỗi ra ngoài**: thông báo trong
   * app đã ghi xong, và để một token chết làm sập cả lời gọi thì nghiệp vụ gọi
   * nó sẽ rollback một việc đã thành công.
   */
  private async push(
    notificationId: string,
    command: IDispatchNotificationCommand,
  ): Promise<number> {
    try {
      if (!(await this.pushSender.canSend())) return 0;

      const tokens = await this.notifications.findPushTokens(command.userId);
      if (tokens.length === 0) return 0;

      const pushed = await this.pushSender.send(tokens, {
        title: command.title,
        body: command.body,
        type: command.type,
        referenceType: command.referenceType ?? null,
        referenceId: command.referenceId ?? null,
      });

      if (pushed > 0) await this.notifications.markPushed([notificationId]);
      return pushed;
    } catch (error) {
      // Ghi lại để vận hành thấy, nhưng không làm hỏng lời gọi.
      this.logger.warn(
        `Không đẩy được thông báo ${notificationId}: ${(error as Error).message}`,
      );
      return 0;
    }
  }
}
