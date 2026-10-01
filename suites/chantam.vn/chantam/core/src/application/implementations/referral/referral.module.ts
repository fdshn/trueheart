import {
  IGetOwnReferralUseCase,
  IListReferralReviewUseCase,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import { Global, Module } from '@nestjs/common';
import { GetOwnReferralUseCase } from './get-own-referral.use-case';
import { ListReferralReviewUseCase } from './list-referral-review.use-case';
import { QualifyReferralUseCase } from './qualify-referral.use-case';

@Global()
@Module({
  providers: [
    { provide: IGetOwnReferralUseCase, useClass: GetOwnReferralUseCase },
    { provide: IQualifyReferralUseCase, useClass: QualifyReferralUseCase },
    {
      provide: IListReferralReviewUseCase,
      useClass: ListReferralReviewUseCase,
    },
  ],
  exports: [
    IGetOwnReferralUseCase,
    IQualifyReferralUseCase,
    IListReferralReviewUseCase,
  ],
})
export class ReferralModule {}
