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
 * **Ở production nó tắt mọi kênh và không bao giờ ghi mã.**
 * Ghi mã xác minh ra log ở môi trường thật nghĩa là bất kỳ ai đọc được log đều
 * chiếm được mọi tài khoản.
 *
 * Bản trước ném lỗi ở `onModuleInit` để chặn production. Sai phạm vi: nó giết
 * cả tiến trình, nên container không qua nổi health check và mọi lần deploy đều
 * thất bại rồi rollback — một tính năng chưa xong làm chết toàn bộ API. Giờ chỉ
 * đúng chức năng quên mật khẩu bị vô hiệu, và người dùng được hướng sang Admin.
 */
@Injectable()
export class LoggingOtpSender implements IOtpSender, OnModuleInit {
  private readonly logger = new Logger(LoggingOtpSender.name);

  public constructor(
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  /**
   * Ở production không kênh nào gửi được. Ở dev/test cả hai kênh đều "gửi" bằng
   * cách ghi log để luồng quên mật khẩu và xác minh SĐT chạy được đầu-cuối.
   *
   * Khi cắm nhà cung cấp email thật, bản hiện thực mới phải trả `true` cho
   * EMAIL và vẫn `false` cho SMS — đó chính là lý do hàm này hỏi theo kênh.
   */
  public canSend(_channel: PasswordResetChannels): boolean {
    return this.config.env !== 'production';
  }

  public onModuleInit(): void {
    if (this.canSend(PasswordResetChannels.EMAIL)) {
      this.logger.warn(
        'Đang dùng LoggingOtpSender — mã xác minh ghi ra log, KHÔNG gửi đi đâu cả. ' +
          'Phải cắm nhà cung cấp email/SMS thật trước khi mở cho người dùng.',
      );

      return;
    }

    this.logger.error(
      'CHƯA CÓ NHÀ CUNG CẤP OTP THẬT. Chức năng quên mật khẩu đang tắt: mọi yêu cầu ' +
        'đặt lại mật khẩu sẽ được trả về kênh ADMIN_SUPPORT. Hiện thực IOtpSender ' +
        'bằng email hoặc Zalo ZNS thật rồi thay LoggingOtpSender.',
    );
  }

  public async send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void> {
    // Lớp chặn thứ hai. Nghiệp vụ đã hỏi `canSend` trước khi gọi, nhưng mã
    // xác minh lọt vào log production là hỏng tới mức không được dựa vào đúng
    // một chỗ kiểm.
    if (!this.canSend(channel))
      throw new Error(
        'LoggingOtpSender không được phép gửi ở production. Đây là lỗi lập trình: ' +
          'phải kiểm IOtpSender.canSend(channel) trước khi sinh mã.',
      );

    this.logger.warn(
      `[CHỈ DÀNH CHO DEV] OTP cho ${channel} ${target}: ${code}`,
    );
  }
}
