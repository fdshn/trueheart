import {
  IAppendPointEntryUseCase,
  IGetOwnPointLedgerUseCase,
  IGetOwnPointSummaryUseCase,
} from '@/application/contracts/point';
import { Global, Module } from '@nestjs/common';
import { AppendPointEntryUseCase } from './append-point-entry.use-case';
import { GetOwnPointLedgerUseCase } from './get-own-point-ledger.use-case';
import { GetOwnPointSummaryUseCase } from './get-own-point-summary.use-case';

@Global()
@Module({
  providers: [
    { provide: IAppendPointEntryUseCase, useClass: AppendPointEntryUseCase },
    { provide: IGetOwnPointLedgerUseCase, useClass: GetOwnPointLedgerUseCase },
    {
      provide: IGetOwnPointSummaryUseCase,
      useClass: GetOwnPointSummaryUseCase,
    },
  ],
  exports: [
    IAppendPointEntryUseCase,
    IGetOwnPointLedgerUseCase,
    IGetOwnPointSummaryUseCase,
  ],
})
export class PointModule {}
