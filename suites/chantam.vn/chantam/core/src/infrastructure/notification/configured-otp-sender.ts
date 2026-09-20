import { IConfig } from '@/domain/ports/config';
import { IOtpSender } from '@/domain/ports/notification';
import {
  INotificationChannelRepository,
  NotificationChannelCodes,
} from '@/domain/ports/repository';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { IMailTransport } from './mail-transport';

/**
 * Những kênh THỰC SỰ có adapter gửi.
 *
 * Admin bật được cả SMS lẫn Zalo trong CMS, nhưng chưa có mã nào gửi nổi hai
 * kênh đó. Danh sách này là nơi duy nhất quyết định, nên bật nhầm trong CMS
 * cũng không biến thành một lời hứa gửi tin.
 */
const ImplementedChannels: PasswordResetChannels[] = [
  'EMAIL' as PasswordResetChannels,
];

@Injectable()
export class ConfiguredOtpSender implements IOtpSender {
  private readonly logger = new Logger(ConfiguredOtpSender.name);

  public constructor(
    @Inject(IConfig) private readonly config: IConfig,
    @Inject(INotificationChannelRepository)
    private readonly channels: INotificationChannelRepository,
    @Inject(IMailTransport) private readonly mail: IMailTransport,
  ) {}

  public async canSend(channel: PasswordResetChannels): Promise<boolean> {
    if (await this.hasRealProvider(channel)) return true;

    // Dev/test vẫn chạy được luồng đầu-cuối bằng cách ghi mã ra log. Production
    // thì không: log lọt ra ngoài là mất mọi tài khoản.
    return this.config.env !== 'production';
  }

  public async send(
    channel: PasswordResetChannels,
    target: string,
    code: string,
  ): Promise<void> {
    if (await this.hasRealProvider(channel)) {
      await this.sendEmail(target, code);
      return;
    }

    // Lớp chặn thứ hai: nghiệp vụ đã hỏi `canSend`, nhưng mã lọt vào log
    // production là hỏng tới mức không được dựa vào đúng một chỗ kiểm.
    if (this.config.env === 'production')
      throw new Error(
        `Kênh ${channel} chưa cấu hình được nhà cung cấp thật. Từ chối gửi ` +
          'thay vì ghi mã xác minh ra log production.',
      );

    this.logger.warn(
      `[CHỈ DÀNH CHO DEV] OTP cho ${channel} ${target} đã được ghi ra log thay vì gửi đi.`,
    );
    this.logger.debug(`[CHỈ DÀNH CHO DEV] mã: ${code}`);
  }

  private async hasRealProvider(
    channel: PasswordResetChannels,
  ): Promise<boolean> {
    if (!ImplementedChannels.includes(channel)) return false;

    return this.channels.isSendable(
      channel as never as NotificationChannelCodes,
    );
  }

  private async sendEmail(target: string, code: string): Promise<void> {
    const [channel] = (await this.channels.list()).filter(
      (candidate) => candidate.channel === 'EMAIL',
    );
    const secret = await this.channels.readSecret('EMAIL');

    if (!channel?.host || !channel.fromAddress || !secret)
      throw new Error(
        'Kênh EMAIL thiếu host, người gửi hoặc secret nên không gửi được.',
      );

    await this.mail.send({
      host: channel.host,
      port: channel.port ?? 587,
      username: channel.username,
      secret,
      fromAddress: channel.fromAddress,
      fromName: channel.fromName,
      to: target,
      subject: 'Mã xác minh Chân Tâm',
      body: `Mã xác minh của bạn là ${code}. Mã chỉ dùng một lần và sẽ hết hạn trong ít phút.`,
    });
  }
}
