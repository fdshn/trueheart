import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { NotificationTypes } from '../../consts';

export interface INotificationDto {
  notificationId: string;
  type: NotificationTypes;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface IListNotificationsQueryDto extends IPaginationQueryDto {
  /** Chỉ lấy thông báo chưa đọc. */
  unreadOnly?: boolean;
}

export interface IListNotificationsResponseDto {
  notifications: INotificationDto[];
  meta: IPaginationMetaDto;
  /** Tổng số chưa đọc, không phụ thuộc trang đang xem — dùng cho badge. */
  unreadCount: number;
}

export interface IMarkNotificationsReadDto {
  /**
   * Danh sách thông báo cần đánh dấu đã đọc. Bỏ trống thì đánh dấu **tất cả**.
   *
   * Cố ý cho phép cả hai: giao diện có nút "đánh dấu tất cả đã đọc", và cũng
   * cần đánh dấu từng cái khi người dùng mở một thông báo.
   */
  notificationIds?: string[];
}

export interface IMarkNotificationsReadBodyDto {
  notifications: IMarkNotificationsReadDto;
}

export interface IMarkNotificationsReadResponseDto {
  markedCount: number;
  unreadCount: number;
}
