import {
  IGetTransactionReviewsUseCase,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import { Global, Module } from '@nestjs/common';
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
  ],
  exports: [ISubmitReviewUseCase, IGetTransactionReviewsUseCase],
})
export class ReviewModule {}
