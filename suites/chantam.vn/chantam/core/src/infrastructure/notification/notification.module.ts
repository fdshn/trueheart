import { IConfig } from '@/domain/ports/config';
import { IOtpSender, IPushSender } from '@/domain/ports/notification';
import { Global, Module } from '@nestjs/common';
import { ConfiguredOtpSender } from './configured-otp-sender';
import { FcmPushSender } from './fcm-push-sender';
import { LoggingPushSender } from './logging-push-sender';
import { IMailTransport } from './mail-transport';
import { NodemailerTransport } from './nodemailer-transport';

/**
 * Năng lực gửi đến từ cấu hình Admin trong database, không phải biến môi
 * trường: đổi SMTP từ CMS là có hiệu lực ngay, không cần deploy lại.
 *
 * Hiện mới có adapter cho EMAIL. SMS và Zalo bật được trong CMS nhưng
 * `ConfiguredOtpSender` vẫn báo không gửi được, cho tới khi có adapter thật.
 *
 * ## Push (F44) chọn bản cài theo cấu hình
 *
 * Có `FCM_SERVICE_ACCOUNT_BASE64` thì dùng `FcmPushSender` (đẩy thật); không có
 * thì `LoggingPushSender` — ghi log ở dev, **fail-closed** ở production.
 *
 * Quyết định dựa trên "biến có giá trị hay không", KHÔNG dựa trên "giá trị có
 * dùng được hay không". Một khoá sai định dạng vẫn chọn `FcmPushSender`, và bản
 * đó ghi một dòng ERROR rồi `canSend()` trả `false` mãi.
 *
 * Vì sao không quay về `LoggingPushSender` khi khoá sai: ở `development` bản đó
 * BÁO ĐÃ GỬI, nên một khoá sai sẽ trông y hệt một khoá đúng. Thà tắt ồn ào.
 *
 * Thông báo TRONG APP không phụ thuộc vào cả hai — mất đường đẩy không được làm
 * mất thông báo.
 */
/**
 * Chọn bản cài đẩy push theo cấu hình.
 *
 * Tách thành hàm có tên thay vì một `useFactory` nằm trong metadata, để phép kiểm
 * gọi được trực tiếp. Một lượt chọn sai nằm trong metadata là thứ không unit test
 * nào thấy, và nó chỉ lộ ra khi production im lặng không đẩy gì.
 */
export function createPushSender(config: IConfig): IPushSender {
  return config.push.serviceAccountBase64.trim() === ''
    ? new LoggingPushSender(config)
    : new FcmPushSender(config);
}

@Global()
@Module({
  providers: [
    { provide: IMailTransport, useClass: NodemailerTransport },
    { provide: IOtpSender, useClass: ConfiguredOtpSender },
    { provide: IPushSender, inject: [IConfig], useFactory: createPushSender },
  ],
  exports: [IOtpSender, IPushSender],
})
export class NotificationModule {}
