import { NotificationTypes } from '../consts';

/**
 * Một thông báo trong app (F44).
 *
 * `idempotencyKey` là thứ giữ cho một sự kiện không sinh hai thông báo khi job
 * chạy lại hay request bị retry — cùng khoá thì lần ghi thứ hai bị database từ
 * chối, không phải được tầng ứng dụng bỏ qua.
 */
export interface INotification {
  globalId: string;
  userId: string;
  type: NotificationTypes;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  readAt: Date | null;
  /**
   * Mốc đã đẩy xuống thiết bị. `null` nghĩa là **chưa đẩy** — có thể vì chưa
   * cấu hình nhà cung cấp, hoặc người dùng không có thiết bị nào đang đăng
   * nhập. Thông báo trong app vẫn hiển thị bình thường trong cả hai trường hợp.
   */
  pushedAt: Date | null;
}
