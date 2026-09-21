import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { INotificationEntity } from '@chantam.vn/chantam.core-lib/entities';
import { EntityManager } from 'typeorm';

export interface ICreateNotificationParams {
  globalId: string;
  userId: string;
  type: NotificationTypes;
  title: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
  /**
   * Khoá chống trùng. Cùng khoá thì lần ghi thứ hai bị **database** từ chối,
   * không phải được tầng ứng dụng bỏ qua — nên job chạy lại hay request bị
   * retry đều không sinh hai thông báo.
   */
  idempotencyKey?: string | null;
}

export interface INotificationRepository {
  /**
   * Ghi thông báo. Trùng `idempotencyKey` thì trả về `null` chứ không ném lỗi —
   * "đã có rồi" là kết quả bình thường, không phải sự cố.
   */
  create(
    params: ICreateNotificationParams,
  ): Promise<INotificationEntity | null>;

  /** Bản dùng trong transaction của nơi gọi, cho các sự kiện phải nguyên tử. */
  createWithinTransaction(
    manager: EntityManager,
    params: ICreateNotificationParams,
  ): Promise<INotificationEntity | null>;

  listForUser(params: {
    userId: string;
    unreadOnly: boolean;
    skip: number;
    take: number;
  }): Promise<{
    items: INotificationEntity[];
    total: number;
    unreadCount: number;
  }>;

  /**
   * Đánh dấu đã đọc. `notificationIds` rỗng hoặc không truyền thì đánh dấu tất
   * cả của người đó.
   *
   * Luôn lọc theo `userId`: thiếu vế đó là cho người này đánh dấu hộ thông báo
   * của người khác.
   */
  markRead(params: {
    userId: string;
    notificationIds?: string[];
  }): Promise<{ markedCount: number; unreadCount: number }>;

  /**
   * FCM token của các phiên đang sống của một người.
   *
   * Nhiều thiết bị thì nhiều token. Phiên đã thu hồi không được trả về, nếu
   * không thông báo sẽ bay tới máy người dùng đã đăng xuất.
   */
  findPushTokens(userId: string): Promise<string[]>;

  markPushed(notificationIds: string[]): Promise<void>;
}

export const INotificationRepository = Symbol('INotificationRepository');
