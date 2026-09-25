import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IAwardGiftCompletionCommand,
  IAwardGiftCompletionResult,
  IAwardGiftCompletionUseCase,
} from '@/application/contracts/review';
import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  normalizeReviewGraceConfig,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';

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
 * Cộng điểm cho người tặng sau khi lượt trao hoàn tất (F40).
 *
 * Số điểm = mức trần của rule × phần trăm chính xác NGƯỜI NHẬN chấm. Giá người
 * tặng tự khai cố ý không tham gia vào phép tính này — đó chính là chỗ chặn việc
 * khai khống để cày điểm.
 *
 * Khi người nhận không đánh giá, dùng mức mặc định trong cấu hình
 * `review.grace`. Cho 0 điểm là phạt người tặng vì việc của người khác; cho
 * thẳng 100% thì người nhận có động cơ *không* đánh giá để giúp người tặng, và
 * chỉ số accuracy mất nghĩa.
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
        multiplierPercent: appliedPercent,
        reason: usedDefault
          ? `Lượt trao hoàn tất, người nhận không đánh giá — áp mức mặc định ${appliedPercent}%`
          : `Lượt trao hoàn tất, người nhận chấm ${appliedPercent}% mức chính xác`,
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
      if (
        error instanceof PointRuleUnavailableException ||
        error instanceof PointDailyCapReachedException
      ) {
        this.logger.warn(
          `Không cộng điểm lượt trao ${command.transactionId}: ${error.message}`,
        );
        return { awarded: false, points: 0, appliedPercent, usedDefault };
      }

      throw error;
    }
  }
}
