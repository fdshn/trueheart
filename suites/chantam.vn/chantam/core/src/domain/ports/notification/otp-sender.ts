import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Gửi mã xác minh tới người dùng.
 *
 * ⚠️ **Chưa có bản hiện thực thật.** Dự án chưa chốt nhà cung cấp email và
 * chưa tích hợp Zalo ZNS / SMS brandname. Hiện chỉ có `LoggingOtpSender` ghi mã
 * ra log, và nó tự tắt toàn bộ kênh ở production.
 */
export interface IOtpSender {
  /**
   * Hỏi theo TỪNG kênh, không phải một cờ chung.
   *
   * Một cờ chung là bẫy: cắm được email xong thì cờ bật, và luồng xác minh SĐT
   * tưởng mình gửi được SMS trong khi chưa có nhà cung cấp nào. Nghiệp vụ phải
   * hỏi đúng kênh nó sắp dùng trước khi sinh mã, rồi chuyển sang hướng dẫn liên
   * hệ Admin nếu kênh đó chưa sẵn sàng.
   *
   * Tồn tại thay cho cách làm cũ là ném lỗi lúc khởi động: chặn cả tiến trình
   * thì một tính năng chưa xong làm chết toàn bộ API, kể cả deploy cũng không
   * qua nổi cổng health check.
   */
  canSend(channel: PasswordResetChannels): boolean;

  send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void>;
}

export const IOtpSender = Symbol('IOtpSender');
