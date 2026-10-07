import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IAwardGiftCompletionCommand,
  IAwardGiftCompletionResult,
  IAwardGiftCompletionUseCase,
} from '@/application/contracts/review';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { GiftCompletedGiverRuleCode } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizeReviewGraceConfig,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { isPointPolicyError } from '../point/point-policy-errors';

/**
 * Mã rule cho phần thưởng của NGƯỜI TẶNG khi lượt trao hoàn tất.
 *
 * Dùng lại đúng mã đã seed từ migration `1791200000000`, KHÔNG tạo mã mới. Mã
 * mới nghĩa là khoá chống trùng mới, và một lượt trao sẽ được trả thưởng hai lần.
 *
 * Trước 07/10 đây là một chuỗi viết lại ngay tại chỗ, trùng chữ với
 * `GiftCompletedGiverRuleCode` trong core-lib. Hai bản sao của một mã rule là
 * đúng thứ đã sinh ra migration `1793400000000` — nên nay trỏ về một nguồn. Giá
 * trị trong rule là mức TRẦN và là số THỰC NHẬN: CHỐT-14 bỏ phép nhân accuracy
 * khỏi khoản này.
 */
export const GiftCompletedRuleCode = GiftCompletedGiverRuleCode;

/**
 * Khoá chống trùng theo LƯỢT TRAO, không theo đường kích hoạt.
 *
 * Đây là điểm tựa của cả cơ chế. **BA** đường cùng dẫn tới một bút toán:
 *
 * 1. lượt trao chuyển `COMPLETED` — `GiftTransactionRepository.awardCompletionPoints`,
 *    chạy trong transaction đóng lượt trao (đường chính từ 07/10);
 * 2. người nhận gửi đánh giá — `SubmitReviewUseCase`;
 * 3. job `gift:settle-rewards`.
 *
 * Đường nào tới trước thì hai đường kia thành không làm gì. Nếu mỗi đường dùng
 * một khoá riêng, một lượt trao được trả thưởng ba lần — và sổ chỉ ghi thêm,
 * không sửa lại được.
 *
 * Đường 1 dựng khoá bằng `` `${ruleCode}:${global_id}` `` ngay tại repository chứ
 * không gọi hàm này, vì tầng hạ tầng không nhập từ tầng ứng dụng. Hai chuỗi phải
 * trùng KHÍT, và `gift-transaction.repository.spec.ts` canh đúng chuyện đó.
 */
export function giftCompletionIdempotencyKey(transactionId: string): string {
  return `${GiftCompletedRuleCode}:${transactionId}`;
}

/**
 * Trả NỐT điểm hoàn tất cho người tặng khi lượt cộng lúc `COMPLETED` không ghi được
 * (F40, CHỐT-14).
 *
 * ## Từ 07/10 đây là đường DỰ PHÒNG, không còn là đường chính
 *
 * CHỐT-14 nói `completion_points` cộng tại `COMPLETED`, và từ 07/10 đúng như vậy:
 * `GiftTransactionRepository.awardCompletionPoints` cộng cho CẢ HAI bên ngay trong
 * transaction đóng lượt trao, ở cả hai đường — người nhận bấm xác nhận, và cron tự
 * hoàn tất.
 *
 * Use case này vì vậy gần như luôn trả `awarded: false` (bút toán đã có). Nó **không
 * bị gỡ** vì một lý do đo được, không phải để chắc ăn: `GIFT_COMPLETED_GIVER` có
 * `daily_cap = 10`. Lượt trao thứ 11 trong một ngày của cùng một người tặng bị trần
 * chặn ngay tại `COMPLETED`, và `awardCompletionPoints` **nuốt** ngoại lệ đó để việc
 * xác nhận nhận hàng không đổ. Không có đường này thì trần ngày biến từ HOÃN thành
 * MẤT.
 *
 * Hai đường gọi tới đây đều là đường quét lại: người nhận gửi đánh giá
 * (`SubmitReviewUseCase`), và job `gift:settle-rewards`. Cùng với lượt cộng tại
 * `COMPLETED` là BA đường, và chúng không trả thưởng hai lần vì tất cả dùng chung
 * `giftCompletionIdempotencyKey` — xem docblock của hàm đó.
 *
 * Nó cũng là đường trả nốt cho những lượt trao đã `COMPLETED` TRƯỚC 07/10: hồi đó
 * không có bút toán nào được ghi lúc hoàn tất, và `findUnsettledGiverRewards` lọc
 * theo đúng khoá chống trùng nên vẫn tìm ra chúng. Không cần migration bù.
 *
 * ## Số điểm KHÔNG nhân với accuracy
 *
 * Tới 06/10 công thức là `mức trần của rule × phần trăm chính xác người nhận chấm`.
 * CHỐT-14 tách làm hai khoản rời:
 *
 * - `completion_points` — **mức trần của rule, không nhân gì**, chính là khoản này;
 * - `value_bonus` — tính từ giá trị ước tính và accuracy, chốt tại hạn `N` ngày trong
 *   `SettleGiftRewardsUseCase`.
 *
 * Nên lượt `appendPointEntry` dưới đây cố ý **không truyền `multiplierPercent`**:
 * `scaleRulePoints` trả trọn `rule.points` khi tham số đó là `undefined`.
 *
 * ## Vì sao vẫn phân giải accuracy dù không còn nhân
 *
 * Accuracy vẫn được ghi vào `reason` và trả về cho bên gọi: nó là dữ kiện audit cho
 * biết lượt trao được chấm bao nhiêu. Khi người nhận không đánh giá, dùng mức mặc
 * định trong cấu hình `review.grace`.
 */
@Injectable()
export class AwardGiftCompletionUseCase implements IAwardGiftCompletionUseCase {
  private readonly logger = new Logger(AwardGiftCompletionUseCase.name);

  public constructor(
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntry: IAppendPointEntryUseCase,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IAwardGiftCompletionCommand,
  ): Promise<IAwardGiftCompletionResult> {
    const usedDefault = command.accuracyPercent === null;
    const appliedPercent = usedDefault
      ? normalizeReviewGraceConfig(
          await this.adminConfig.getConfigValue(ReviewGraceConfigKey),
        ).defaultAccuracyPercent
      : (command.accuracyPercent as number);

    try {
      const entry = await this.appendPointEntry.handle({
        userId: command.giverId,
        ruleCode: GiftCompletedRuleCode,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: command.transactionId,
        idempotencyKey: giftCompletionIdempotencyKey(command.transactionId),
        actor: usedDefault ? 'SYSTEM' : command.giverId,
        source: command.source,
        // KHÔNG truyền `multiplierPercent`: CHỐT-14 đòi điểm hoàn tất là mức trần
        // của rule, không nhân accuracy. `scaleRulePoints` trả trọn `rule.points`
        // khi tham số này là `undefined`.
        reason: usedDefault
          ? `Lượt trao hoàn tất, người nhận không đánh giá — ghi mức mặc định ${appliedPercent}% (không nhân vào điểm hoàn tất)`
          : `Lượt trao hoàn tất, người nhận chấm ${appliedPercent}% mức chính xác (không nhân vào điểm hoàn tất)`,
      });

      return {
        awarded: entry.applied,
        points: entry.delta,
        appliedPercent,
        usedDefault,
      };
    } catch (error) {
      // Nuốt ĐÚNG hai loại: rule bị Admin tắt, và chạm cap ngày. Cả hai là
      // quyết định vận hành bình thường và không được làm hỏng việc đánh giá
      // hay làm job đối soát dừng giữa danh sách.
      //
      // Mọi lỗi khác ném tiếp. `catch` trống ở đây sẽ biến một sự cố database
      // thành "hôm nay không ai được điểm" mà không ai biết.
      if (isPointPolicyError(error)) {
        this.logger.warn(
          `Không cộng điểm lượt trao ${command.transactionId}: ${error.message}`,
        );
        return { awarded: false, points: 0, appliedPercent, usedDefault };
      }

      throw error;
    }
  }
}
