import {
  NotificationGroups,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
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

  /**
   * Những NHÓM thông báo người này đã tắt.
   *
   * Bảng chỉ chứa ngoại lệ — không có dòng nghĩa là đang bật — nên câu này
   * thường trả về mảng rỗng và rẻ.
   */
  listMutedGroups(userId: string): Promise<NotificationGroups[]>;

  /** Tắt/bật một nhóm. Bình thái: gọi hai lần cho cùng một kết quả. */
  setGroupMuted(params: {
    userId: string;
    group: NotificationGroups;
    muted: boolean;
  }): Promise<void>;

  /**
   * Xoá thông báo cũ hơn hạn lưu trữ.
   *
   * Xoá theo TUỔI, không phân biệt đã đọc hay chưa. Một thông báo chưa đọc sau
   * 90 ngày không còn là thứ ai đó sắp đọc — giữ nó lại chỉ để hộp thư phình
   * ra, trong khi nội dung nó mang (tiêu đề bài, tên người, đoạn đầu tin nhắn)
   * chính là thứ chính sách lưu trữ muốn dọn.
   */
  purgeOlderThan(params: {
    olderThanDays: number;
    limit: number;
  }): Promise<number>;

  markPushed(notificationIds: string[]): Promise<void>;
}

export const INotificationRepository = Symbol('INotificationRepository');
