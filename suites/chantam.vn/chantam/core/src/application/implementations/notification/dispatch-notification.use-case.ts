import {
  IDispatchNotificationCommand,
  IDispatchNotificationResult,
  IDispatchNotificationUseCase,
} from '@/application/contracts/notification';
import { IPushSender } from '@/domain/ports/notification';
import { INotificationRepository } from '@/domain/ports/repository';
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
  ) {}

  public async handle(
    command: IDispatchNotificationCommand,
  ): Promise<IDispatchNotificationResult> {
    const created = await this.notifications.create({
      // Chống trùng là việc của `idempotencyKey` (UNIQUE ở database), không
      // phải của id. Nếu id cũng tiền định thì hai thông báo hợp lệ khác nhau
      // mà thiếu `idempotencyKey` sẽ đụng nhau ở id.
      globalId: randomUUID(),
      userId: command.userId,
      type: command.type,
      title: command.title,
      body: command.body,
      referenceType: command.referenceType ?? null,
      referenceId: command.referenceId ?? null,
      idempotencyKey: command.idempotencyKey ?? null,
    });

    // Trùng khoá nghĩa là đã thông báo lần trước rồi. Đẩy lại là làm điện thoại
    // người dùng rung hai lần cho cùng một việc.
    if (!created) return { created: false, pushedDevices: 0 };

    const pushedDevices = await this.push(created.globalId, command);
    return { created: true, pushedDevices };
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
