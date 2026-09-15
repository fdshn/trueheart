import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Gửi mã xác minh tới người dùng.
 *
 * ⚠️ **Chưa có bản hiện thực thật.** Dự án chưa chốt nhà cung cấp email và
 * chưa tích hợp Zalo ZNS / SMS brandname. Hiện chỉ có `LoggingOtpSender` ghi mã
 * ra log và **tự từ chối chạy ở production**.
 *
 * Trước khi mở cho người dùng thật, phải có một bản hiện thực thật cắm vào đây.
 */
export interface IOtpSender {
  send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void>;
}

export const IOtpSender = Symbol('IOtpSender');
