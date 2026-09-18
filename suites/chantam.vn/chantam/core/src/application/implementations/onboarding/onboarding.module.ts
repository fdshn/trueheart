import { IRecordOnboardingEvidenceUseCase } from '@/application/contracts/onboarding';
import { Global, Module } from '@nestjs/common';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IRecordOnboardingEvidenceUseCase,
      useClass: RecordOnboardingEvidenceUseCase,
    },
  ],
  exports: [IRecordOnboardingEvidenceUseCase],
})
export class OnboardingModule {}
