import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Gửi mã xác minh tới người dùng.
 *
 * ⚠️ **Chưa có bản hiện thực thật.** Dự án chưa chốt nhà cung cấp email và
 * chưa tích hợp Zalo ZNS / SMS brandname. Hiện chỉ có `LoggingOtpSender` ghi mã
 * ra log, và nó tự khai `isConfigured = false` ở production.
 */
export interface IOtpSender {
  /**
   * `false` nghĩa là chưa cắm được kênh gửi thật. Nghiệp vụ phải hỏi trước khi
   * sinh mã, và chuyển sang hướng dẫn liên hệ Admin thay vì gửi.
   *
   * Tồn tại thay cho cách làm cũ là ném lỗi lúc khởi động: chặn cả tiến trình
   * thì một tính năng chưa xong làm chết toàn bộ API, kể cả deploy cũng không
   * qua nổi cổng health check. Thiếu nhà cung cấp OTP chỉ nên làm hỏng đúng
   * chức năng quên mật khẩu.
   */
  readonly isConfigured: boolean;

  send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void>;
}

export const IOtpSender = Symbol('IOtpSender');
