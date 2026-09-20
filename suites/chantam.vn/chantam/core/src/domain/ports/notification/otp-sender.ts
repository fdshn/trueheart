import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Gửi mã xác minh tới người dùng.
 *
 * Năng lực gửi đến từ cấu hình Admin trong database (xem
 * `notification_channels`), không phải biến môi trường. Hiện mới có adapter
 * EMAIL qua SMTP; SMS và Zalo ZNS chưa có, nên dù Admin bật kênh trong CMS thì
 * `canSend` vẫn trả `false` ở production.
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
   * Bất đồng bộ vì năng lực gửi nằm ở cấu hình Admin trong database, không phải
   * ở biến môi trường lúc khởi động.
   */
  canSend(channel: PasswordResetChannels): Promise<boolean>;

  send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void>;
}

export const IOtpSender = Symbol('IOtpSender');
