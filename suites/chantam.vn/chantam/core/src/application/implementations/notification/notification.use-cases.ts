import {
  IListNotificationsCommand,
  IListNotificationsResult,
  IListNotificationsUseCase,
  IMarkNotificationsReadCommand,
  IMarkNotificationsReadResult,
  IMarkNotificationsReadUseCase,
} from '@/application/contracts/notification';
import { INotificationRepository } from '@/domain/ports/repository';
import { INotificationDto } from '@chantam.vn/chantam.core-lib/dto';
import { INotificationEntity } from '@chantam.vn/chantam.core-lib/entities';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

function toDto(notification: INotificationEntity): INotificationDto {
  return {
    notificationId: notification.globalId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

@Injectable()
export class ListNotificationsUseCase implements IListNotificationsUseCase {
  public constructor(
    @Inject(INotificationRepository)
    private readonly notifications: INotificationRepository,
  ) {}

  public async handle(
    command: IListNotificationsCommand,
  ): Promise<IListNotificationsResult> {
    const { skip, take } = toSkipTake(command);
    const { items, total, unreadCount } = await this.notifications.listForUser({
      userId: command.userId,
      unreadOnly: command.unreadOnly ?? false,
      skip,
      take,
    });

    return {
      notifications: items.map(toDto),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
      unreadCount,
    };
  }
}

@Injectable()
export class MarkNotificationsReadUseCase implements IMarkNotificationsReadUseCase {
  public constructor(
    @Inject(INotificationRepository)
    private readonly notifications: INotificationRepository,
  ) {}

  public async handle(
    command: IMarkNotificationsReadCommand,
  ): Promise<IMarkNotificationsReadResult> {
    // Không ném lỗi khi id không thuộc người này: câu UPDATE đã lọc theo
    // `userId` nên nó chỉ đơn giản không khớp dòng nào. Báo lỗi ở đây sẽ nói
    // cho người gọi biết id đó có thật hay không.
    return this.notifications.markRead({
      userId: command.userId,
      notificationIds: command.notifications.notificationIds,
    });
  }
}
