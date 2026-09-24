import {
  IReconcileGiverAccuracyCommand,
  IReconcileGiverAccuracyResult,
  IReconcileGiverAccuracyUseCase,
} from '@/application/contracts/review';
import { ITransactionReviewRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Tính lại chỉ số Giver Accuracy của mọi người theo ngưỡng đang cấu hình.
 *
 * Cờ `accuracy_review_required` chỉ được cập nhật khi người đó nhận một đánh
 * giá MỚI. Nghĩa là Admin hạ ngưỡng từ 75 xuống 60 thì những người đang bị gắn
 * cờ ở 65 vẫn mang cờ — có khi mãi mãi, nếu họ không tặng gì nữa. Đây là chỗ
 * kéo mọi hồ sơ về đúng ngưỡng hiện hành.
 *
 * Chạy bằng `npm run accuracy:reconcile`, thêm `--dry-run` để chỉ xem.
 */
@Injectable()
export class ReconcileGiverAccuracyUseCase implements IReconcileGiverAccuracyUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
  ) {}

  public async handle(
    command: IReconcileGiverAccuracyCommand,
  ): Promise<IReconcileGiverAccuracyResult> {
    return this.reviews.reconcileAccuracy({ dryRun: command.dryRun === true });
  }
}
