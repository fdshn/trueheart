import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';

export interface INotificationTemplate {
  readonly type: NotificationTypes;
  readonly title: string;
  readonly body: string;
  readonly isEnabled: boolean;
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
}

export interface IUpdateNotificationTemplateParams {
  readonly type: NotificationTypes;
  readonly title: string;
  readonly body: string;
  readonly isEnabled: boolean;
  readonly updatedBy: string;
}

export interface INotificationTemplateRepository {
  /** Toàn bộ mẫu, kể cả mẫu đang tắt — Admin cần thấy để bật. */
  listAll(): Promise<INotificationTemplate[]>;
  /**
   * Mẫu ĐANG BẬT của một loại. `null` khi chưa có hoặc đang tắt.
   *
   * Trả `null` cho mẫu tắt thay vì để nơi gọi tự lọc: quên một phép lọc là
   * lặng lẽ dùng một mẫu Admin đã cố ý tắt.
   */
  findEnabled(type: NotificationTypes): Promise<INotificationTemplate | null>;
  /** Sửa nội dung hoặc bật/tắt. Trả `null` khi loại không tồn tại. */
  update(
    params: IUpdateNotificationTemplateParams,
  ): Promise<INotificationTemplate | null>;
}

export const INotificationTemplateRepository = Symbol(
  'INotificationTemplateRepository',
);
