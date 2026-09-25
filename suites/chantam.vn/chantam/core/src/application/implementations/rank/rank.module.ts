import {
  IEvaluateDueRankMaintenanceUseCase,
  IGetOwnRankSummaryUseCase,
  IPromoteOnboardingMemberUseCase,
} from '@/application/contracts/rank';
import { Global, Module } from '@nestjs/common';
import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';
import { GetOwnRankSummaryUseCase } from './get-own-rank-summary.use-case';
import { PromoteOnboardingMemberUseCase } from './promote-onboarding-member.use-case';
import { RankChangeNotifier } from './rank-change.notifier';

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
    RankChangeNotifier,
  ],
  exports: [
    IEvaluateDueRankMaintenanceUseCase,
    IGetOwnRankSummaryUseCase,
    IPromoteOnboardingMemberUseCase,
    RankChangeNotifier,
  ],
})
export class RankModule {}
