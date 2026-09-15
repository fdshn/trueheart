import { IConfig } from '@/domain/ports/config';
import { IOtpSender } from '@/domain/ports/notification';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Bản hiện thực TẠM THỜI: ghi mã ra log thay vì gửi thật.
 *
 * Dự án chưa chốt nhà cung cấp email và chưa tích hợp Zalo ZNS / SMS brandname.
 * Lớp này để luồng quên mật khẩu chạy được đầu-cuối ở môi trường phát triển.
 *
 * **Tự từ chối chạy ở production.** Ghi mã xác minh ra log ở môi trường thật
 * nghĩa là bất kỳ ai đọc được log đều chiếm được mọi tài khoản. Thà sập lúc
 * khởi động còn hơn chạy được rồi lặng lẽ rò.
 */
@Injectable()
export class LoggingOtpSender implements IOtpSender, OnModuleInit {
  private readonly logger = new Logger(LoggingOtpSender.name);

  public constructor(
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public onModuleInit(): void {
    if (this.config.env !== 'production') {
      this.logger.warn(
        'Đang dùng LoggingOtpSender — mã xác minh ghi ra log, KHÔNG gửi đi đâu cả. ' +
          'Phải cắm nhà cung cấp email/SMS thật trước khi mở cho người dùng.',
      );

      return;
    }

    throw new Error(
      'LoggingOtpSender không được phép chạy ở production: nó ghi mã xác minh ra log. ' +
        'Hiện thực IOtpSender bằng nhà cung cấp email hoặc Zalo ZNS thật trước khi triển khai.',
    );
  }

  public async send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void> {
    this.logger.warn(
      `[CHỈ DÀNH CHO DEV] OTP cho ${channel} ${target}: ${code}`,
    );
  }
}
