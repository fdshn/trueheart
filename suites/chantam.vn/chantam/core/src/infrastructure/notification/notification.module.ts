import { IOtpSender, IPushSender } from '@/domain/ports/notification';
import { Global, Module } from '@nestjs/common';
import { ConfiguredOtpSender } from './configured-otp-sender';
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
 * Push (F44) cũng vậy: `LoggingPushSender` ghi log ở dev và **fail-closed** ở
 * production cho tới khi có khoá dự án Firebase. Thông báo TRONG APP không phụ
 * thuộc vào nó — mất đường đẩy không được làm mất thông báo.
 */
@Global()
@Module({
  providers: [
    { provide: IMailTransport, useClass: NodemailerTransport },
    { provide: IOtpSender, useClass: ConfiguredOtpSender },
    { provide: IPushSender, useClass: LoggingPushSender },
  ],
  exports: [IOtpSender, IPushSender],
})
export class NotificationModule {}
