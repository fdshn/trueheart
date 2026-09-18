import { IGetOwnRankSummaryUseCase } from '@/application/contracts/rank';
import { Global, Module } from '@nestjs/common';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';

@Global()
@Module({
  providers: [
    { provide: IGetOwnRankSummaryUseCase, useClass: GetOwnRankSummaryUseCase },
  ],
  exports: [IGetOwnRankSummaryUseCase],
})
export class RankModule {}
