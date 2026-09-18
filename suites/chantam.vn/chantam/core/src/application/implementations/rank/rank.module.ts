import {
  IGetOwnRankSummaryUseCase,
  IPromoteOnboardingMemberUseCase,
} from '@/application/contracts/rank';
import { Global, Module } from '@nestjs/common';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';
import { PromoteOnboardingMemberUseCase } from './promote-onboarding-member.use-case';

@Global()
@Module({
  providers: [
    { provide: IGetOwnRankSummaryUseCase, useClass: GetOwnRankSummaryUseCase },
    {
      provide: IPromoteOnboardingMemberUseCase,
      useClass: PromoteOnboardingMemberUseCase,
    },
  ],
  exports: [IGetOwnRankSummaryUseCase, IPromoteOnboardingMemberUseCase],
})
export class RankModule {}
