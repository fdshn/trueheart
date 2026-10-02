import {
  INotifyLunarObservanceCommand,
  INotifyLunarObservanceResult,
  INotifyLunarObservanceUseCase,
} from '@/application/contracts/lunar';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IBulkNotifyAudienceRepository,
  ILunarHolidayRepository,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { lunarDateOf, observanceOf } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';

const DefaultBatchSize = 500;

/**
 * Nhắc ngày Rằm / Mùng Một và ngày lễ Phật giáo (UC-LUNAR-01, BR-DHARMA-03, mục mở L28).
 *
 * ## Hai câu chờ Bên A, và câu trả lời đã chốt
 *
 * **Gửi cho ai.** SRS mục 1507 cho hai lựa chọn: *"toàn hệ thống hoặc theo nhóm/vùng"*.
 * Chọn **toàn hệ thống** — đó là một trong hai lựa chọn đặc tả cho phép, và lựa chọn kia
 * đòi F47 (thông báo theo khu vực) vốn chưa làm. Khi F47 xong, `IBulkNotifyAudienceRepository`
 * là chỗ duy nhất phải sửa: thêm một mệnh đề `ST_DWithin` vào đúng câu đó.
 *
 * **Gửi vào giờ nào.** KHÔNG quyết ở đây. Giờ là cấu hình vận hành, và cron đã là chỗ của
 * nó. Việc của use case là **chạy lại được an toàn** ở bất kỳ giờ nào: khoá chống trùng gắn
 * ngày âm lịch, nên chạy ba lần trong một ngày vẫn ra một thông báo mỗi người.
 *
 * ## Vì sao gửi theo lô, và vì sao một lỗi không dừng cả vòng
 *
 * Phân trang theo khoá, mỗi lô 500. Nạp hết người dùng vào bộ nhớ rồi gửi là một mảng
 * trăm nghìn phần tử cho một việc chạy nền.
 *
 * Một lượt gửi hỏng chỉ được đếm vào `failed`, không được làm dừng vòng: hỏng ở người thứ
 * 300 mà dừng nghĩa là 99.700 người còn lại không nhận được gì, vì một người.
 */
@Injectable()
export class NotifyLunarObservanceUseCase implements INotifyLunarObservanceUseCase {
  private readonly logger = new Logger(NotifyLunarObservanceUseCase.name);

  public constructor(
    @Inject(ILunarHolidayRepository)
    private readonly holidays: ILunarHolidayRepository,
    @Inject(IBulkNotifyAudienceRepository)
    private readonly audience: IBulkNotifyAudienceRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: INotifyLunarObservanceCommand,
  ): Promise<INotifyLunarObservanceResult> {
    const at = command.at ?? new Date();
    const lunar = lunarDateOf(at);
    const observance = observanceOf(lunar);
    const holiday = await this.holidays.findByLunarDate(lunar.month, lunar.day);

    const pad = (value: number): string => String(value).padStart(2, '0');
    const lunarDate = `${pad(lunar.day)}/${pad(lunar.month)}`;
    const base = {
      lunarDate,
      observance,
      holidayName: holiday?.name ?? null,
    };

    // Không mốc nào và không ngày lễ nào — khoảng 25 ngày mỗi tháng. Thoát sớm, và nói rõ
    // là thoát vì không có gì để nhắc.
    if (observance === null && holiday === null)
      return {
        ...base,
        skipped: true,
        audience: 0,
        notified: 0,
        alreadySent: 0,
        failed: 0,
      };

    const { title, body } = this.composeMessage(
      observance,
      holiday?.name ?? null,
    );

    if (command.dryRun === true) {
      this.logger.log(`[dry-run] ${title} — ${body}`);
      return {
        ...base,
        skipped: false,
        audience: 0,
        notified: 0,
        alreadySent: 0,
        failed: 0,
      };
    }

    const batchSize = command.batchSize ?? DefaultBatchSize;
    let afterId = 0;
    let audience = 0;
    let notified = 0;
    let alreadySent = 0;
    let failed = 0;

    for (;;) {
      const batch = await this.audience.findActiveUserIdsAfter({
        afterId,
        limit: batchSize,
      });
      if (batch.length === 0) break;

      for (const user of batch) {
        audience += 1;
        try {
          const result = await this.dispatch.handle({
            userId: user.globalId,
            type: NotificationTypes.LUNAR_OBSERVANCE,
            title,
            body,
            referenceType: 'LUNAR',
            referenceId: lunarDate,
            // Khoá gắn NGÀY ÂM LỊCH và năm âm lịch: chạy lại trong cùng ngày không gửi
            // trùng, mà sang Rằm tháng sau thì vẫn gửi được.
            idempotencyKey: `LUNAR_OBSERVANCE:${lunar.year}:${lunar.month}:${lunar.day}:${user.globalId}`,
            variables: {
              lunarDate,
              holiday: holiday?.name ?? '',
            },
          });
          if (result.created) notified += 1;
          else alreadySent += 1;
        } catch (error) {
          // Một người hỏng không được làm dừng vòng.
          failed += 1;
          this.logger.warn(
            `Không gửi được cho ${user.globalId}: ${String(error)}`,
          );
        }
      }

      afterId = batch[batch.length - 1].id;
      if (batch.length < batchSize) break;
    }

    return { ...base, skipped: false, audience, notified, alreadySent, failed };
  }

  /**
   * Câu chữ.
   *
   * Ngày lễ ĐÈ lên câu mốc khi có cả hai: Vu Lan rơi đúng Rằm tháng 7, và nói "Hôm nay là
   * Ngày Rằm" ở đó là bỏ mất điều đáng nói hơn. Vẫn giữ phần chúc của đặc tả.
   */
  private composeMessage(
    observance: 'FULL_MOON' | 'NEW_MOON' | null,
    holidayName: string | null,
  ): { title: string; body: string } {
    const blessing = 'Chúc bạn một ngày an lạc và tràn đầy duyên lành sẻ chia!';

    if (holidayName !== null)
      return {
        title: holidayName,
        body: `Hôm nay là ${holidayName}. ${blessing}`,
      };

    const label = observance === 'FULL_MOON' ? 'Ngày Rằm' : 'Mùng Một';
    return { title: label, body: `Hôm nay là ${label} – ${blessing}` };
  }
}
