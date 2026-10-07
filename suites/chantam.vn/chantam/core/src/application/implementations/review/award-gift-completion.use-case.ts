import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IAwardGiftCompletionCommand,
  IAwardGiftCompletionResult,
  IAwardGiftCompletionUseCase,
} from '@/application/contracts/review';
import { IAdminConfigRepository } from '@/domain/ports/repository';
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
 * mới nghĩa là khoá chống trùng mới, và một lượt trao sẽ được trả thưởng hai
 * lần: một lần phẳng lúc hoàn tất, một lần nữa theo % lúc đánh giá.
 *
 * Giá trị trong rule là mức TRẦN; số thực nhận là trần × phần trăm chính xác
 * người nhận chấm (F40).
 */
export const GiftCompletedRuleCode = 'GIFT_COMPLETED_GIVER';

/**
 * Khoá chống trùng theo LƯỢT TRAO, không theo đường kích hoạt.
 *
 * Đây là điểm tựa của cả cơ chế: hai đường cùng dẫn tới đây — người nhận đánh
 * giá, hoặc job hết hạn chờ — và đường nào tới trước thì đường kia thành không
 * làm gì. Nếu mỗi đường dùng một khoá riêng, một lượt trao được trả thưởng hai
 * lần.
 */
export function giftCompletionIdempotencyKey(transactionId: string): string {
  return `${GiftCompletedRuleCode}:${transactionId}`;
}

/**
 * Cộng điểm hoàn tất cho người tặng sau khi lượt trao xong (F40, CHỐT-14).
 *
 * ## Số điểm KHÔNG nhân với accuracy nữa
 *
 * Tới 06/10 công thức là `mức trần của rule × phần trăm chính xác người nhận chấm`.
 * CHỐT-14 (SRS, 07/10) tách làm hai khoản rời:
 *
 * - `completion_points` — **mức trần của rule, không nhân gì**, chính là use case này;
 * - `value_bonus` — tính từ giá trị ước tính và accuracy, chốt sau hạn `N` ngày.
 *
 * Nên lượt `appendPointEntry` dưới đây cố ý **không truyền `multiplierPercent`**:
 * `scaleRulePoints` trả trọn `rule.points` khi tham số đó là `undefined`.
 *
 * > `value_bonus` CHƯA được hiện thực. Trong khoảng đó, accuracy không ảnh hưởng số
 * > điểm nào — xem `docs/plan/GIVE-RECEIVE-2026-10-07.md`. Đây là trạng thái trung
 * > gian có chủ ý: thà điểm hoàn tất đúng ngay, còn phần theo giá trị đến sau, hơn là
 * > giữ một công thức mà SRS đã bỏ.
 *
 * ## Vì sao vẫn phân giải accuracy dù không còn nhân
 *
 * Quyết định accuracy vẫn được ghi vào `reason` và trả về cho bên gọi: nó là dữ kiện
 * audit cho biết lượt trao được chấm bao nhiêu, và là đầu vào của `value_bonus` sắp
 * tới. Bỏ nó đi bây giờ thì khi dựng `value_bonus` phải đi tìm lại.
 *
 * Khi người nhận không đánh giá, dùng mức mặc định trong cấu hình `review.grace`.
 *
 * ## Thời điểm cộng vẫn là lúc ĐÁNH GIÁ, chưa phải lúc `COMPLETED`
 *
 * CHỐT-14 nói `completion_points` cộng tại `COMPLETED`. Hiện hai đường kích hoạt vẫn
 * là người nhận đánh giá hoặc job hết hạn chờ. Dời mốc đó là một thay đổi riêng, cần
 * lo khoá chống trùng giữa ba đường — không gộp vào lượt sửa công thức này.
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
