import {
  ICompletedGiftCountCommand,
  IGiveActivityCountResult,
  IGiveActivityCounter,
  ILifetimeCompletedGiftCountCommand,
} from '@/domain/ports/give-activity.counter';
import { IGiftTransactionRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Nguồn hoạt động "đã tặng xong" thật, đọc từ giao dịch M3.
 *
 * Thay cho bản luôn báo unavailable trước đây. Chừng nào còn unavailable thì
 * chính sách rank giữ nguyên hạng và ghi `UNEVALUATED`, nên không ai lên được
 * Bạc và không chu kỳ duy trì nào được mở.
 */
@Injectable()
export class GiftActivityCounter implements IGiveActivityCounter {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async countCompletedGifts(
    command: ICompletedGiftCountCommand,
  ): Promise<IGiveActivityCountResult> {
    return {
      available: true,
      completedGifts: await this.transactions.countCompletedByGiver(
        command.userId,
        { from: command.cycleStart, to: command.cycleEnd },
      ),
    };
  }

  public async countLifetimeCompletedGifts(
    command: ILifetimeCompletedGiftCountCommand,
  ): Promise<IGiveActivityCountResult> {
    // Thăng hạng thường xét cả quá trình, không bó trong một quý.
    return {
      available: true,
      completedGifts: await this.transactions.countCompletedByGiver(
        command.userId,
      ),
    };
  }
}
