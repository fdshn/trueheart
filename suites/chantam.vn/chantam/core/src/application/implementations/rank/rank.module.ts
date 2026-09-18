import {
  IEvaluateDueRankMaintenanceUseCase,
  IGetOwnRankSummaryUseCase,
  IPromoteOnboardingMemberUseCase,
} from '@/application/contracts/rank';
import { Global, Module } from '@nestjs/common';
import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';
import { PromoteOnboardingMemberUseCase } from './promote-onboarding-member.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IEvaluateDueRankMaintenanceUseCase,
      useClass: EvaluateDueRankMaintenanceUseCase,
    },
    { provide: IGetOwnRankSummaryUseCase, useClass: GetOwnRankSummaryUseCase },
    {
      provide: IPromoteOnboardingMemberUseCase,
      useClass: PromoteOnboardingMemberUseCase,
    },
  ],
  exports: [
    IEvaluateDueRankMaintenanceUseCase,
    IGetOwnRankSummaryUseCase,
    IPromoteOnboardingMemberUseCase,
  ],
})
export class RankModule {}
