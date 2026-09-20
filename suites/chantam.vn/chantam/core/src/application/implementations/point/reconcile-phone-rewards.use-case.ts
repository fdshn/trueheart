import {
  IAppendPointEntryUseCase,
  IReconcilePhoneRewardsCommand,
  IReconcilePhoneRewardsResult,
  IReconcilePhoneRewardsUseCase,
  PhoneRewardReconcileBatchSize,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Trả lại phần thưởng xác minh SĐT bị mất khi tiến trình chết giữa hai bước.
 *
 * Xác minh SĐT ghi vào `users`, còn thưởng ghi vào ledger — hai transaction
 * riêng. Chết ở giữa là người dùng mất thưởng vĩnh viễn, vì không có cách nào
 * xác minh lại cùng một số. Ledger idempotent theo khoá nên chạy lại bao nhiêu
 * lần cũng không thưởng hai lần.
 */
@Injectable()
export class ReconcilePhoneRewardsUseCase implements IReconcilePhoneRewardsUseCase {
  private readonly logger = new Logger(ReconcilePhoneRewardsUseCase.name);

  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
  ) {}

  public async handle(
    command: IReconcilePhoneRewardsCommand,
  ): Promise<IReconcilePhoneRewardsResult> {
    const userIds = await this.ledger.findPhoneVerifiedUsersMissingReward(
      command.limit ?? PhoneRewardReconcileBatchSize,
    );

    let repairedRewards = 0;
    for (const userId of userIds) {
      // Một người hỏng không được chặn cả lô: lần chạy sau vẫn phải vá được
      // những người còn lại.
      try {
        await this.appendPointEntryUseCase.handle({
          userId,
          ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
          referenceType: 'PHONE_VERIFICATION',
          referenceId: userId,
          idempotencyKey: `PHONE_VERIFIED_FIRST_TIME:${userId}`,
          actor: 'SYSTEM',
          source: 'RECONCILIATION',
        });
        repairedRewards += 1;
      } catch (error) {
        this.logger.error(
          `Không vá được thưởng xác minh SĐT cho một tài khoản: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { repairedRewards };
  }
}
