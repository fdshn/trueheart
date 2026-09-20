import { IOtpSender } from '@/domain/ports/notification';
import { Global, Module } from '@nestjs/common';
import { ConfiguredOtpSender } from './configured-otp-sender';
import { IMailTransport } from './mail-transport';
import { NodemailerTransport } from './nodemailer-transport';

/**
 * Năng lực gửi đến từ cấu hình Admin trong database, không phải biến môi
 * trường: đổi SMTP từ CMS là có hiệu lực ngay, không cần deploy lại.
 *
 * Hiện mới có adapter cho EMAIL. SMS và Zalo bật được trong CMS nhưng
 * `ConfiguredOtpSender` vẫn báo không gửi được, cho tới khi có adapter thật.
 */
@Global()
@Module({
  providers: [
    { provide: IMailTransport, useClass: NodemailerTransport },
    { provide: IOtpSender, useClass: ConfiguredOtpSender },
  ],
  exports: [IOtpSender],
})
export class NotificationModule {}
