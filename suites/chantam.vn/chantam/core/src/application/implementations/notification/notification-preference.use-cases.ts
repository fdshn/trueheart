import { INotificationRepository } from '@/domain/ports/repository';
import {
  NotificationGroupOf,
  NotificationGroups,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

export interface INotificationPreference {
  group: NotificationGroups;
  muted: boolean;
  /** Những loại thuộc nhóm này, để client khỏi tự đoán. */
  types: NotificationTypes[];
}

/**
 * Cài đặt thông báo của một người, theo NHÓM.
 *
 * Luôn trả đủ bốn nhóm kể cả khi người dùng chưa đụng tới cài đặt — bảng chỉ
 * chứa ngoại lệ, nhưng màn hình thì cần đủ bốn công tắc.
 */
@Injectable()
export class NotificationPreferenceUseCases {
  public constructor(
    @Inject(INotificationRepository)
    private readonly notifications: INotificationRepository,
  ) {}

  public async list(userId: string): Promise<INotificationPreference[]> {
    const muted = new Set(await this.notifications.listMutedGroups(userId));

    return Object.values(NotificationGroups).map((group) => ({
      group,
      muted: muted.has(group),
      types: (Object.keys(NotificationGroupOf) as NotificationTypes[]).filter(
        (type) => NotificationGroupOf[type] === group,
      ),
    }));
  }

  public async set(params: {
    userId: string;
    group: NotificationGroups;
    muted: boolean;
  }): Promise<INotificationPreference[]> {
    await this.notifications.setGroupMuted(params);
    return this.list(params.userId);
  }
}
