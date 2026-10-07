import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IAwardGiftCompletionUseCase,
  ISettledGiftReward,
  ISettledReceiverReward,
  ISettledValueBonus,
  ISettleGiftRewardsCommand,
  ISettleGiftRewardsResult,
  ISettleGiftRewardsUseCase,
} from '@/application/contracts/review';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import { GiftCompletedReceiverRuleCode } from '@chantam.vn/chantam.core-lib/consts';
import {
  computeGiftValueBonus,
  DefaultGiftValueBonusMaxValueVnd,
  GiftValueBonusMaxValueConfigKey,
  normalizePointRedemptionConfig,
  normalizeReviewGraceConfig,
  PointRedemptionConfigKey,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { appendPointIgnoringPolicy } from '../point/point-policy-errors';

const DefaultLimit = 500;

/**
 * Mã phân loại của bút toán `value_bonus`.
 *
 * KHÔNG có dòng tương ứng trong `point_rules`, và đó là chủ ý: mức của khoản này
 * tính từ `posts.estimated_value` và tỷ lệ `point.redemption`, nên tạo một bản sao
 * con số sang `point_rules` là mở đường cho hai nơi nói hai mức. Cùng lý do mà điểm
 * danh F83 đi qua `appendAdjustment` thay vì `appendByRule`.
 */
const GiftValueBonusRuleCode = 'GIFT_VALUE_BONUS_GIVER';

/**
 * Trả nốt những phần thưởng của một lượt trao còn treo (F40).
 *
 * **Bốn việc, một job**, vì cả bốn đều là "lượt trao đã hoàn tất mà bút toán
 * tương ứng chưa có":
 *
 * 1. **Điểm hoàn tất của người tặng bị trần ngày chặn.** Từ 07/10 khoản này cộng
 *    ngay tại `COMPLETED` (CHỐT-14), nên đây không còn là đường chính. Nhưng
 *    `GIFT_COMPLETED_GIVER` có `daily_cap = 10` và lượt cộng tại `COMPLETED`
 *    **nuốt** ngoại lệ trần để việc xác nhận nhận hàng không đổ — nên lượt thứ 11
 *    trong ngày chỉ có đường này trả nốt. Danh sách cũng còn bắt những lượt đã
 *    `COMPLETED` TRƯỚC 07/10, hồi chưa có bút toán nào ghi lúc hoàn tất, nên
 *    không cần migration bù.
 *
 * 2. **Mức chính xác cho những lượt chưa ai chấm.** Sau `graceDays`, áp mức mặc
 *    định trong cấu hình `review.grace`. Mức đó **không tính vào mẫu Giver
 *    Accuracy** — nó là số hệ thống tự điền, không phải ý kiến của người thật — và
 *    từ CHỐT-14 nó không còn ảnh hưởng điểm hoàn tất, chỉ ảnh hưởng `value_bonus`
 *    ở việc thứ tư.
 *
 * 3. **Phần thưởng của người NHẬN bị trần ngày chặn.** Cộng phẳng lúc hoàn tất
 *    và nuốt ngoại lệ chính sách, nên chạm trần là mất — và chưa từng có đường
 *    nào quét lại phía này.
 *
 * 4. **`value_bonus` theo giá trị món đồ (CHỐT-14).** Chốt MỘT lần tại hạn
 *    `graceDays`, không trả sớm khi đánh giá vừa gửi: trước hạn người nhận còn
 *    được sửa đánh giá một lần, nên trả sớm là trả theo một con số còn sửa được.
 *
 * Trần ngày với một lượt trao nghĩa là HOÃN, không phải mất: xem
 * `RetryablePointRuleCodes`. Chạy bằng `npm run gift:settle-rewards`, thêm
 * `--dry-run` để chỉ xem.
 */
@Injectable()
export class SettleGiftRewardsUseCase implements ISettleGiftRewardsUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IAwardGiftCompletionUseCase)
    private readonly awardGiftCompletion: IAwardGiftCompletionUseCase,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntry: IAppendPointEntryUseCase,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async handle(
    command: ISettleGiftRewardsCommand,
  ): Promise<ISettleGiftRewardsResult> {
    const config = normalizeReviewGraceConfig(
      await this.adminConfig.getConfigValue(ReviewGraceConfigKey),
    );

    const limit = command.limit ?? DefaultLimit;
    const pending = await this.reviews.findUnsettledGiverRewards({
      graceDays: config.graceDays,
      limit,
    });
    const pendingReceivers = await this.reviews.findUnsettledReceiverRewards({
      limit,
    });
    const pendingValueBonuses = await this.reviews.findUnsettledValueBonuses({
      graceDays: config.graceDays,
      limit,
    });

    const redemption = normalizePointRedemptionConfig(
      await this.adminConfig.getConfigValue(PointRedemptionConfigKey),
    );
    // Trần là một SỐ NGUYÊN, không phải JSON — xem docblock khoá. Thiếu dòng cấu
    // hình thì dùng mặc định chứ không tắt: tắt im lặng là người tặng mất điểm mà
    // không ai biết vì sao.
    const rawCap = Number(
      await this.adminConfig.getConfigValue(GiftValueBonusMaxValueConfigKey),
    );
    const maxValueVnd =
      Number.isFinite(rawCap) && rawCap >= 0
        ? Math.trunc(rawCap)
        : DefaultGiftValueBonusMaxValueVnd;

    const base = {
      pending: pending.length,
      pendingReceivers: pendingReceivers.length,
      graceDays: config.graceDays,
      defaultPercent: config.defaultAccuracyPercent,
      pendingValueBonuses: pendingValueBonuses.length,
      maxValueVnd,
    };

    if (command.dryRun === true)
      return {
        ...base,
        settled: [],
        settledReceivers: [],
        settledValueBonuses: [],
      };

    const settled: ISettledGiftReward[] = [];
    for (const completion of pending) {
      // Từng lượt một bút toán riêng, không gộp: một lượt chạm cap ngày hoặc
      // gặp lỗi không được kéo theo cả danh sách. Use case cộng điểm đã nuốt
      // đúng hai loại ngoại lệ vận hành và ném tiếp mọi thứ khác.
      const award = await this.awardGiftCompletion.handle({
        transactionId: completion.transactionId,
        giverId: completion.giverId,
        // Mức người nhận đã chấm nếu có; `null` là tín hiệu "không có đánh giá"
        // để use case tự đọc mức mặc định. Chấm 0% KHÁC không chấm.
        accuracyPercent: completion.accuracyPercent,
        source:
          completion.accuracyPercent === null
            ? 'GRACE_EXPIRED'
            : 'CAP_DEFERRED',
      });

      if (award.awarded)
        settled.push({
          transactionId: completion.transactionId,
          giverId: completion.giverId,
          points: award.points,
          appliedPercent: award.appliedPercent,
        });
    }

    const settledReceivers: ISettledReceiverReward[] = [];
    for (const completion of pendingReceivers) {
      // Cùng khoá chống trùng mà đường hoàn tất dùng, nên chạy song song với
      // `transaction:autocomplete` cũng chỉ thưởng một lần.
      const award = await appendPointIgnoringPolicy(this.appendPointEntry, {
        userId: completion.receiverId,
        ruleCode: GiftCompletedReceiverRuleCode,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: completion.transactionId,
        idempotencyKey: `${GiftCompletedReceiverRuleCode}:${completion.transactionId}`,
        actor: 'SYSTEM',
        source: 'CAP_DEFERRED',
      });

      if (award?.applied === true)
        settledReceivers.push({
          transactionId: completion.transactionId,
          receiverId: completion.receiverId,
          points: award.delta,
        });
    }

    const settledValueBonuses: ISettledValueBonus[] = [];
    for (const due of pendingValueBonuses) {
      const appliedPercent =
        due.accuracyPercent === null
          ? config.defaultAccuracyPercent
          : due.accuracyPercent;
      const bonus = computeGiftValueBonus({
        estimatedValueVnd: due.estimatedValueVnd,
        vndPerPoint: redemption.vndPerPoint,
        accuracyPercent: appliedPercent,
        maxValueVnd,
      });

      // Bonus 0 thì KHÔNG ghi bút toán. Khác đường điểm hoàn tất: ở đó bút toán
      // delta = 0 là bằng chứng "đã chấm, và chấm 0" và nó chiếm khoá chống trùng.
      // Ở đây 0 thường nghĩa là bài không khai giá — ghi một dòng 0 cho mọi lượt
      // trao không khai giá chỉ làm sổ điểm phình mà không nói thêm gì.
      if (bonus.points <= 0) continue;

      const award = await this.ledger.appendAdjustment({
        userId: due.giverId,
        ruleCode: GiftValueBonusRuleCode,
        delta: bonus.points,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: due.transactionId,
        idempotencyKey: `${GiftValueBonusRuleCode}:${due.transactionId}`,
        actor: 'SYSTEM',
        source: 'GRACE_EXPIRED',
        reason:
          `Thưởng theo giá trị tại hạn ${config.graceDays} ngày: ` +
          `${bonus.appliedValueVnd}đ / ${redemption.vndPerPoint}đ mỗi điểm ` +
          `× ${appliedPercent}%` +
          (bonus.capped ? ` (đã cắt theo trần ${maxValueVnd}đ)` : ''),
      });

      if (award.applied)
        settledValueBonuses.push({
          transactionId: due.transactionId,
          giverId: due.giverId,
          points: award.delta,
          appliedPercent,
          appliedValueVnd: bonus.appliedValueVnd,
          capped: bonus.capped,
        });
    }

    return { ...base, settled, settledReceivers, settledValueBonuses };
  }
}
