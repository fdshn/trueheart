import { IQualifyReferralUseCase } from '@/application/contracts/referral';
import { Global, Module } from '@nestjs/common';
import { QualifyReferralUseCase } from './qualify-referral.use-case';

@Global()
@Module({
  providers: [
    { provide: IQualifyReferralUseCase, useClass: QualifyReferralUseCase },
  ],
  exports: [IQualifyReferralUseCase],
})
export class ReferralModule {}
