import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IAwardGiftCompletionUseCase,
  ISettledGiftReward,
  ISettledReceiverReward,
  ISettleGiftRewardsCommand,
  ISettleGiftRewardsResult,
  ISettleGiftRewardsUseCase,
} from '@/application/contracts/review';
import {
  IAdminConfigRepository,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import { GiftCompletedReceiverRuleCode } from '@chantam.vn/chantam.core-lib/consts';
import {
  normalizeReviewGraceConfig,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { appendPointIgnoringPolicy } from '../point/point-policy-errors';

const DefaultLimit = 500;

/**
 * Trả nốt những phần thưởng của một lượt trao còn treo (F40).
 *
 * **Ba việc, một job**, vì cả ba đều là "lượt trao đã hoàn tất mà bút toán
 * tương ứng chưa có":
 *
 * 1. **Người nhận không bao giờ đánh giá.** Phần lớn người nhận sẽ nhận đồ rồi
 *    biến mất. Không có đường này thì điểm của người tặng treo vô hạn, và họ bị
 *    phạt vì việc của người khác. Nhưng cũng không thể trả 100%: người nhận sẽ
 *    có động cơ *không* đánh giá để giúp người tặng, và chỉ số accuracy mất
 *    nghĩa. Nên sau `graceDays`, áp mức mặc định trong cấu hình `review.grace`.
 *    Mức đó **không tính vào mẫu Giver Accuracy** — nó là số hệ thống tự điền,
 *    không phải ý kiến của người thật.
 *
 * 2. **Đã đánh giá nhưng lần cộng điểm bị trần ngày chặn.** Trả đúng mức người
 *    nhận đã chấm, không phải mức mặc định. Trước đây dạng này rơi ra khỏi mọi
 *    danh sách và mất vĩnh viễn.
 *
 * 3. **Phần thưởng của người NHẬN bị trần ngày chặn.** Cộng phẳng lúc hoàn tất
 *    và nuốt ngoại lệ chính sách, nên chạm trần là mất — và chưa từng có đường
 *    nào quét lại phía này.
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

    const base = {
      pending: pending.length,
      pendingReceivers: pendingReceivers.length,
      graceDays: config.graceDays,
      defaultPercent: config.defaultAccuracyPercent,
    };

    if (command.dryRun === true)
      return { ...base, settled: [], settledReceivers: [] };

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

    return { ...base, settled, settledReceivers };
  }
}
