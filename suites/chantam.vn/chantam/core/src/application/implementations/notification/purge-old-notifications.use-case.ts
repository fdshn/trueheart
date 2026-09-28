import {
  IAdminConfigRepository,
  INotificationRepository,
} from '@/domain/ports/repository';
import {
  NotificationRetentionConfigKey,
  normalizeNotificationRetentionConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Một lô mỗi vòng.
 *
 * Bảng đã tích vài năm mà xoá một phát thì khoá bảng lâu và thổi phồng WAL.
 * Job gọi lại cho tới khi hết — cùng lối với `chat:purge`.
 */
const PurgeBatchSize = 5_000;

/** Trần số vòng trong một lần chạy, để job không chạy vô tận. */
const MaxBatchesPerRun = 20;

/**
 * Dọn thông báo cũ hơn hạn lưu trữ.
 *
 * **Vì sao cần.** Thông báo mang tiêu đề bài, tên người và **đoạn đầu tin nhắn
 * chat**. Chat đã có hạn lưu trữ và xoá cả chữ lẫn ảnh — nhưng bản sao đoạn đầu
 * của chính những câu đó vẫn nằm trong hộp thư mãi mãi. Đó là một lỗ trong chính
 * sách lưu trữ, không chỉ là chuyện bảng phình to.
 */
@Injectable()
export class PurgeOldNotificationsUseCase {
  private readonly logger = new Logger(PurgeOldNotificationsUseCase.name);

  public constructor(
    @Inject(INotificationRepository)
    private readonly notifications: INotificationRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(): Promise<{ purged: number; hitBatchLimit: boolean }> {
    const retention = normalizeNotificationRetentionConfig(
      await this.adminConfig.getConfigValue(NotificationRetentionConfigKey),
    );

    let purged = 0;
    let batches = 0;
    for (; batches < MaxBatchesPerRun; batches += 1) {
      const removed = await this.notifications.purgeOlderThan({
        olderThanDays: retention.retentionDays,
        limit: PurgeBatchSize,
      });
      purged += removed;
      if (removed < PurgeBatchSize) break;
    }

    const hitBatchLimit = batches >= MaxBatchesPerRun;
    if (hitBatchLimit)
      // Chạm trần nghĩa là còn tồn đọng. Nói ra để người vận hành biết mà tăng
      // nhịp chạy, thay vì để job im lặng không bao giờ đuổi kịp.
      this.logger.warn(
        `Chạm trần ${MaxBatchesPerRun} lô trong một lần chạy — vẫn còn thông báo quá hạn chưa dọn.`,
      );

    return { purged, hitBatchLimit };
  }
}
