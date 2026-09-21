import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';

export interface IPushMessage {
  title: string;
  body: string;
  type: NotificationTypes;
  /** Để client điều hướng khi người dùng chạm vào thông báo. */
  referenceType: string | null;
  referenceId: string | null;
}

/**
 * Đẩy thông báo xuống thiết bị (F44).
 *
 * **`canSend()` là một câu hỏi thật, không phải hình thức.** Chưa có khoá dự án
 * Firebase thì đường đẩy chưa dùng được, và nghiệp vụ phải biết điều đó để
 * không nói với người dùng rằng đã gửi. Thông báo trong app vẫn ghi và hiển thị
 * bình thường — hai việc tách rời nhau, mất đường đẩy không được làm mất thông
 * báo.
 *
 * Bất đồng bộ vì năng lực gửi có thể nằm ở cấu hình Admin trong database, không
 * chỉ ở biến môi trường lúc khởi động — giống `IOtpSender`.
 */
export interface IPushSender {
  canSend(): Promise<boolean>;

  /**
   * Gửi tới nhiều thiết bị của cùng một người.
   *
   * Trả về số token gửi được. **Không ném lỗi khi một token chết**: thiết bị cũ
   * bị gỡ app là chuyện thường, và để nó làm sập cả lượt gửi thì những thiết bị
   * còn lại cũng không nhận được gì.
   */
  send(tokens: string[], message: IPushMessage): Promise<number>;
}

export const IPushSender = Symbol('IPushSender');
