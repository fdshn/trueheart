import {
  IAppendPointEntryUseCase,
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
  IReconcilePhoneRewardsUseCase,
} from '@/application/contracts/point';
import { Global, Module } from '@nestjs/common';
import { AppendPointEntryUseCase } from './append-point-entry.use-case';
import { GetOwnPointLedgerUseCase } from './get-own-point-ledger.use-case';
import { GetOwnPointSummaryUseCase } from './get-own-point-summary.use-case';
import { ReconcilePhoneRewardsUseCase } from './reconcile-phone-rewards.use-case';

@Global()
@Module({
  providers: [
    { provide: IAppendPointEntryUseCase, useClass: AppendPointEntryUseCase },
    { provide: IGetOwnPointLedgerUseCase, useClass: GetOwnPointLedgerUseCase },
    {
      provide: IGetOwnPointSummaryUseCase,
      useClass: GetOwnPointSummaryUseCase,
    },
    {
      provide: IReconcilePhoneRewardsUseCase,
      useClass: ReconcilePhoneRewardsUseCase,
    },
  ],
  exports: [
    IAppendPointEntryUseCase,
    IGetOwnPointLedgerUseCase,
    IGetOwnPointSummaryUseCase,
    IReconcilePhoneRewardsUseCase,
  ],
})
export class PointModule {}
