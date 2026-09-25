import {
  IAwardGiftCompletionUseCase,
  ISettledGiftReward,
  ISettleGiftRewardsCommand,
  ISettleGiftRewardsResult,
  ISettleGiftRewardsUseCase,
} from '@/application/contracts/review';
import {
  IAdminConfigRepository,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import {
  normalizeReviewGraceConfig,
  ReviewGraceConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

const DefaultLimit = 500;

/**
 * Trả thưởng cho lượt trao mà người nhận không bao giờ đánh giá (F40).
 *
 * **Vì sao phải có.** Phần lớn người nhận sẽ nhận đồ rồi biến mất. Không có
 * đường này thì điểm của người tặng treo vô hạn, và họ bị phạt vì việc của
 * người khác. Nhưng cũng không thể trả 100%: người nhận sẽ có động cơ *không*
 * đánh giá để giúp người tặng, và chỉ số accuracy mất nghĩa.
 *
 * Nên sau `graceDays`, hệ thống áp mức mặc định trong cấu hình `review.grace`.
 * Mức đó **không tính vào mẫu Giver Accuracy** — nó là số hệ thống tự điền,
 * không phải ý kiến của người thật.
 *
 * Chạy bằng `npm run gift:settle-rewards`, thêm `--dry-run` để chỉ xem.
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
  ) {}

  public async handle(
    command: ISettleGiftRewardsCommand,
  ): Promise<ISettleGiftRewardsResult> {
    const config = normalizeReviewGraceConfig(
      await this.adminConfig.getConfigValue(ReviewGraceConfigKey),
    );

    const pending = await this.reviews.findUnreviewedCompletions({
      graceDays: config.graceDays,
      limit: command.limit ?? DefaultLimit,
    });

    const base = {
      pending: pending.length,
      graceDays: config.graceDays,
      defaultPercent: config.defaultAccuracyPercent,
    };

    if (command.dryRun === true) return { ...base, settled: [] };

    const settled: ISettledGiftReward[] = [];
    for (const completion of pending) {
      // Từng lượt một bút toán riêng, không gộp: một lượt chạm cap ngày hoặc
      // gặp lỗi không được kéo theo cả danh sách. Use case cộng điểm đã nuốt
      // đúng hai loại ngoại lệ vận hành và ném tiếp mọi thứ khác.
      const award = await this.awardGiftCompletion.handle({
        transactionId: completion.transactionId,
        giverId: completion.giverId,
        // `null` là tín hiệu "không có đánh giá" — use case tự đọc mức mặc định.
        accuracyPercent: null,
        source: 'GRACE_EXPIRED',
      });

      if (award.awarded)
        settled.push({
          transactionId: completion.transactionId,
          giverId: completion.giverId,
          points: award.points,
          appliedPercent: award.appliedPercent,
        });
    }

    return { ...base, settled };
  }
}
