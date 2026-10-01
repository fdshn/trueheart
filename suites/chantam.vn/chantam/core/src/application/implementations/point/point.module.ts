import {
  IAdjustUserPointsUseCase,
  IAppendPointEntryUseCase,
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
  IReconcileMilestoneRewardsUseCase,
  IReversePointEntryUseCase,
} from '@/application/contracts/point';
import { ReferralModule } from '@/application/implementations/referral/referral.module';
import { Global, Module } from '@nestjs/common';
import { AdjustUserPointsUseCase } from './adjust-user-points.use-case';
import { AppendPointEntryUseCase } from './append-point-entry.use-case';
import { GetOwnPointLedgerUseCase } from './get-own-point-ledger.use-case';
import { GetOwnPointSummaryUseCase } from './get-own-point-summary.use-case';
import { ReconcileMilestoneRewardsUseCase } from './reconcile-milestone-rewards.use-case';
import { ReversePointEntryUseCase } from './reverse-point-entry.use-case';

@Global()
@Module({
  /**
   * `ReferralModule` phải nằm Ở ĐÂY, không ở từng module CLI.
   *
   * `ReconcileMilestoneRewardsUseCase` cần `IQualifyReferralUseCase` (xem ghi chú trong
   * chính use case đó về việc vì sao không gọi thẳng repository). Nó là provider của
   * module này, nên mọi cây DI import `PointModule` đều phải giải được phụ thuộc đó.
   *
   * `@Global()` KHÔNG thay được: nó chỉ có hiệu lực sau khi module được import ở đâu
   * đó trong cây, và cây của các CLI không đi qua `ApiModule`. Đo được 30/09: sửa riêng
   * `PointCliModule` thì `point:reconcile` chạy, nhưng `chat-purge`, `post-expire` và
   * `rank-evaluate` vẫn chết lúc khởi động — ba cây khác cũng import `PointModule`.
   * `scripts/smoke-cli.sh` bắt cả ba.
   */
  imports: [ReferralModule],
  providers: [
    { provide: IAppendPointEntryUseCase, useClass: AppendPointEntryUseCase },
    { provide: IAdjustUserPointsUseCase, useClass: AdjustUserPointsUseCase },
    {
      provide: IReversePointEntryUseCase,
      useClass: ReversePointEntryUseCase,
    },
    { provide: IGetOwnPointLedgerUseCase, useClass: GetOwnPointLedgerUseCase },
    {
      provide: IGetOwnPointSummaryUseCase,
      useClass: GetOwnPointSummaryUseCase,
    },
    {
      provide: IReconcileMilestoneRewardsUseCase,
      useClass: ReconcileMilestoneRewardsUseCase,
    },
  ],
  exports: [
    IAppendPointEntryUseCase,
    IAdjustUserPointsUseCase,
    IReversePointEntryUseCase,
    IGetOwnPointLedgerUseCase,
    IGetOwnPointSummaryUseCase,
    IReconcileMilestoneRewardsUseCase,
  ],
})
export class PointModule {}
