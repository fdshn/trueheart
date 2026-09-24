import {
  IGetTransactionReviewsUseCase,
  IReconcileGiverAccuracyUseCase,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import { Global, Module } from '@nestjs/common';
import { ReconcileGiverAccuracyUseCase } from './reconcile-giver-accuracy.use-case';
import {
  GetTransactionReviewsUseCase,
  SubmitReviewUseCase,
} from './review.use-cases';

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
  ],
  exports: [
    ISubmitReviewUseCase,
    IGetTransactionReviewsUseCase,
    IReconcileGiverAccuracyUseCase,
  ],
})
export class ReviewModule {}
