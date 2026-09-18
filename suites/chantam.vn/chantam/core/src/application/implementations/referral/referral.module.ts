import {
  IGetOwnReferralUseCase,
  IQualifyReferralUseCase,
} from '@/application/contracts/referral';
import { Global, Module } from '@nestjs/common';
import { GetOwnReferralUseCase } from './get-own-referral.use-case';
import { QualifyReferralUseCase } from './qualify-referral.use-case';

@Global()
@Module({
  providers: [
    { provide: IGetOwnReferralUseCase, useClass: GetOwnReferralUseCase },
    { provide: IQualifyReferralUseCase, useClass: QualifyReferralUseCase },
  ],
  exports: [IGetOwnReferralUseCase, IQualifyReferralUseCase],
})
export class ReferralModule {}
