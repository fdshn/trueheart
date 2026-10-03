import {
  ICreateBroadcastCommand,
  ICreateBroadcastResult,
  ICreateBroadcastUseCase,
  IDispatchNotificationUseCase,
  IListBroadcastsCommand,
  IListBroadcastsResult,
  IListBroadcastsUseCase,
  IProcessBroadcastCommand,
  IProcessBroadcastResult,
  IProcessBroadcastUseCase,
} from '@/application/contracts/notification';
import {
  IAdminConfigRepository,
  IBulkNotifyAudienceRepository,
  INotificationBroadcastRepository,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  broadcastAudienceGaps,
  broadcastIdempotencyKey,
  normalizeBroadcastAudience,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';

const DefaultBatchSize = 500;

/**
 * Tạo một lượt gửi hàng loạt (F47, SRS mục 1507).
 *
 * KHÔNG gửi gì ở đây — chỉ ghi một hàng `PENDING` và trả về số người nhận đã đếm trước.
 * Gửi đồng bộ trong một request HTTP là hết giờ ở lượt đầu tiên có trăm nghìn người.
 *
 * Quyền `notification.manage` đã seed từ trước, không phải thêm mới.
 */
@Injectable()
export class CreateBroadcastUseCase implements ICreateBroadcastUseCase {
  public constructor(
    @Inject(INotificationBroadcastRepository)
    private readonly broadcasts: INotificationBroadcastRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateBroadcastCommand,
  ): Promise<ICreateBroadcastResult> {
    if (
      !(await this.admin.hasPermission(
        command.actorUserId,
        'notification.manage',
      ))
    )
      throw new ForbiddenException();

    const audience = normalizeBroadcastAudience(command.audience);
    // Truyền cả `command.audience` thô: `normalizeBroadcastAudience` lùi `type` lạ về
    // `ALL`, và đó là hướng lùi KHÔNG được phép im lặng ở đây — một bộ lọc đọc không ra
    // mà thành "gửi cho tất cả" là gửi cho trăm nghìn người thay vì một nhóm nhỏ. Hàm
    // gaps cần thấy giá trị gốc để bắt được ca đó.
    const gaps = broadcastAudienceGaps(audience, command.audience);
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    const title = command.title.trim();
    const body = command.body.trim();
    if (title.length < 3 || body.length < 3)
      throw new ValidationFailedException([
        'title và body đều phải có ít nhất 3 ký tự',
      ]);

    const broadcast = await this.broadcasts.create({
      actorUserId: command.actorUserId,
      audience,
      notificationType: NotificationTypes.SYSTEM_BROADCAST,
      title,
      body,
    });

    return { broadcast };
  }
}

@Injectable()
export class ListBroadcastsUseCase implements IListBroadcastsUseCase {
  public constructor(
    @Inject(INotificationBroadcastRepository)
    private readonly broadcasts: INotificationBroadcastRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListBroadcastsCommand,
  ): Promise<IListBroadcastsResult> {
    if (
      !(await this.admin.hasPermission(
        command.actorUserId,
        'notification.manage',
      ))
    )
      throw new ForbiddenException();

    return this.broadcasts.listRecent({
      limit: command.limit,
      offset: command.offset,
    });
  }
}

/**
 * Gửi nốt lượt gửi còn dở (F47).
 *
 * ## Một lượt chạy làm MỘT lượt gửi
 *
 * Không vét hết hàng đợi trong một lượt: một lượt gửi trăm nghìn người đã là vài phút, và
 * ba lượt liên tiếp là một job chạy nửa tiếng mà không ai biết nó đang ở đâu. Cron gọi lại
 * sau vài phút và nhặt lượt tiếp theo.
 *
 * ## Tiếp từ con trỏ, không bắt đầu lại
 *
 * `lastUserId` cho lượt chạy tiếp đúng chỗ còn dở. Khoá chống trùng vẫn chặn gửi lại, nhưng
 * không có con trỏ thì nó phải đi qua hàng chục nghìn lượt gọi vô ích trước khi tới đó.
 *
 * ## Lỗi của một người nhận khác lỗi của hệ thống
 *
 * Một lượt `dispatch` hỏng chỉ đếm vào `failed` — hỏng ở người thứ 300 mà dừng nghĩa là
 * những người còn lại không nhận gì, vì một người. Nhưng một lỗi khi ĐỌC lô (mất database)
 * thì đánh dấu `FAILED` và dừng: tiếp tục trong trạng thái đó là ghi số liệu sai.
 */
@Injectable()
export class ProcessBroadcastUseCase implements IProcessBroadcastUseCase {
  private readonly logger = new Logger(ProcessBroadcastUseCase.name);

  public constructor(
    @Inject(INotificationBroadcastRepository)
    private readonly broadcasts: INotificationBroadcastRepository,
    @Inject(IBulkNotifyAudienceRepository)
    private readonly audience: IBulkNotifyAudienceRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: IProcessBroadcastCommand,
  ): Promise<IProcessBroadcastResult> {
    const broadcast = await this.broadcasts.findNextPending();

    const idle: IProcessBroadcastResult = {
      broadcastId: null,
      audienceLabel: null,
      audience: null,
      processed: 0,
      notified: 0,
      alreadySent: 0,
      failed: 0,
      completed: false,
    };
    if (!broadcast) return idle;

    const base = {
      broadcastId: broadcast.globalId,
      audienceLabel: broadcast.audienceLabel,
      audience: broadcast.audience,
    };

    if (command.dryRun === true) {
      this.logger.log(
        `[dry-run] ${broadcast.title} → ${broadcast.audienceLabel}`,
      );
      return { ...base, ...idle, broadcastId: broadcast.globalId };
    }

    await this.broadcasts.markSending(broadcast.globalId);

    const batchSize = command.batchSize ?? DefaultBatchSize;
    let afterId = broadcast.lastUserId;
    let processed = 0;
    let notified = 0;
    let alreadySent = 0;
    let failed = 0;

    try {
      for (;;) {
        const batch = await this.audience.findActiveUserIdsAfter({
          afterId,
          limit: batchSize,
          audience: broadcast.audience,
        });
        if (batch.length === 0) break;

        let batchNotified = 0;
        let batchAlready = 0;
        let batchFailed = 0;

        for (const user of batch) {
          try {
            const result = await this.dispatch.handle({
              userId: user.globalId,
              type: broadcast.notificationType as NotificationTypes,
              title: broadcast.title,
              body: broadcast.body,
              referenceType: 'BROADCAST',
              referenceId: broadcast.globalId,
              idempotencyKey: broadcastIdempotencyKey(
                broadcast.globalId,
                user.globalId,
              ),
            });
            if (result.created) batchNotified += 1;
            else batchAlready += 1;
          } catch (error) {
            batchFailed += 1;
            this.logger.warn(
              `Không gửi được cho ${user.globalId}: ${String(error)}`,
            );
          }
        }

        afterId = batch[batch.length - 1].id;
        processed += batch.length;
        notified += batchNotified;
        alreadySent += batchAlready;
        failed += batchFailed;

        // Ghi tiến độ SAU MỖI LÔ, không chờ hết vòng: mất kết nối ở lô thứ 120 mà chưa
        // ghi gì thì con trỏ vẫn ở 0, và lượt chạy lại làm lại từ đầu.
        await this.broadcasts.recordProgress({
          globalId: broadcast.globalId,
          lastUserId: afterId,
          audienceDelta: batch.length,
          notifiedDelta: batchNotified,
          alreadySentDelta: batchAlready,
          failedDelta: batchFailed,
        });

        if (batch.length < batchSize) break;
      }

      await this.broadcasts.markCompleted(broadcast.globalId);

      return {
        ...base,
        processed,
        notified,
        alreadySent,
        failed,
        completed: true,
      };
    } catch (error) {
      // Lỗi ở tầng ĐỌC lô, không phải ở một người nhận. Dừng và đánh dấu — tiếp tục
      // trong trạng thái này là ghi số liệu sai.
      await this.broadcasts.markFailed(broadcast.globalId, String(error));
      throw error;
    }
  }
}
