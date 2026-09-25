import {
  IAwardGiftCompletionUseCase,
  IGetTransactionReviewsUseCase,
  IReconcileGiverAccuracyUseCase,
  ISettleGiftRewardsUseCase,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import { Global, Module } from '@nestjs/common';
import { AwardGiftCompletionUseCase } from './award-gift-completion.use-case';
import { ReconcileGiverAccuracyUseCase } from './reconcile-giver-accuracy.use-case';
import {
  GetTransactionReviewsUseCase,
  SubmitReviewUseCase,
} from './review.use-cases';
import { SettleGiftRewardsUseCase } from './settle-gift-rewards.use-case';

@Global()
@Module({
  providers: [
    { provide: ISubmitReviewUseCase, useClass: SubmitReviewUseCase },
    {
      provide: IGetTransactionReviewsUseCase,
      useClass: GetTransactionReviewsUseCase,
    },
    {
      provide: IReconcileGiverAccuracyUseCase,
      useClass: ReconcileGiverAccuracyUseCase,
    },
    {
      provide: IAwardGiftCompletionUseCase,
      useClass: AwardGiftCompletionUseCase,
    },
    { provide: ISettleGiftRewardsUseCase, useClass: SettleGiftRewardsUseCase },
  ],
  exports: [
    ISubmitReviewUseCase,
    IGetTransactionReviewsUseCase,
    IReconcileGiverAccuracyUseCase,
    IAwardGiftCompletionUseCase,
    ISettleGiftRewardsUseCase,
  ],
})
export class ReviewModule {}
