import {
  IAppendPointEntryUseCase,
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
  IReconcileMilestoneRewardsUseCase,
  IReversePointEntryUseCase,
} from '@/application/contracts/point';
import { Global, Module } from '@nestjs/common';
import { AppendPointEntryUseCase } from './append-point-entry.use-case';
import { GetOwnPointLedgerUseCase } from './get-own-point-ledger.use-case';
import { GetOwnPointSummaryUseCase } from './get-own-point-summary.use-case';
import { ReconcileMilestoneRewardsUseCase } from './reconcile-milestone-rewards.use-case';
import { ReversePointEntryUseCase } from './reverse-point-entry.use-case';

@Global()
@Module({
  providers: [
    { provide: IAppendPointEntryUseCase, useClass: AppendPointEntryUseCase },
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
    IReversePointEntryUseCase,
    IGetOwnPointLedgerUseCase,
    IGetOwnPointSummaryUseCase,
    IReconcileMilestoneRewardsUseCase,
  ],
})
export class PointModule {}
