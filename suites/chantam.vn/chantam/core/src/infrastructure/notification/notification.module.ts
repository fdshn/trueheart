import { IOtpSender } from '@/domain/ports/notification';
import { Global, Module } from '@nestjs/common';
import { LoggingOtpSender } from './logging-otp-sender';

/**
 * ⚠️ Mới chỉ có bản ghi log. Xem `logging-otp-sender.ts` — nó tự từ chối chạy ở
 * production. Khi tích hợp email hoặc Zalo ZNS thì đổi `useClass` ở đây.
 */
@Global()
@Module({
  providers: [{ provide: IOtpSender, useClass: LoggingOtpSender }],
  exports: [IOtpSender],
})
export class NotificationModule {}
