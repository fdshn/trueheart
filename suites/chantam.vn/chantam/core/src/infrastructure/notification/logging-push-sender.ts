import { IConfig } from '@/domain/ports/config';
import { IPushMessage, IPushSender } from '@/domain/ports/notification';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Bộ gửi push chưa cắm nhà cung cấp.
 *
 * **Vì sao tồn tại thay vì để `IPushSender` là `undefined`.** Thông báo trong
 * app phải chạy được ngay, độc lập với việc có Firebase hay chưa; nếu nghiệp vụ
 * phải tự kiểm `if (pushSender)` ở mọi chỗ gọi thì sớm muộn có chỗ quên.
 *
 * Ở `development`/`test` nó ghi log để lập trình viên thấy đúng payload sẽ bay
 * xuống thiết bị. Ở `production` nó **fail-closed**: `canSend()` trả `false`,
 * `send()` không gửi gì và trả 0. Không bao giờ giả vờ đã gửi — báo cáo sai về
 * việc đã thông báo còn tệ hơn không thông báo, vì không ai đi tìm nguyên nhân.
 */
@Injectable()
export class LoggingPushSender implements IPushSender {
  private readonly logger = new Logger(LoggingPushSender.name);

  public constructor(@Inject(IConfig) private readonly config: IConfig) {}

  private get isProduction(): boolean {
    return this.config.env === 'production';
  }

  public async canSend(): Promise<boolean> {
    // Không có khoá dự án Firebase thì không có đường gửi. Nói thật ở đây để
    // nghiệp vụ không hứa hộ một việc chưa làm được.
    return Promise.resolve(!this.isProduction);
  }

  public async send(tokens: string[], message: IPushMessage): Promise<number> {
    if (this.isProduction || tokens.length === 0) return 0;

    // KHÔNG log token: nó là định danh thiết bị. Chỉ log số lượng.
    this.logger.debug(
      `[push giả lập] ${message.type} → ${tokens.length} thiết bị: ${message.title}`,
    );
    return tokens.length;
  }
}
