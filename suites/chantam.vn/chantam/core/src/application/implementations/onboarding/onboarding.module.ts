import {
  IEvaluateOnboardingTasksUseCase,
  IGetOnboardingTasksUseCase,
  IRecordOnboardingEvidenceUseCase,
} from '@/application/contracts/onboarding';
import { Global, Module } from '@nestjs/common';
import { EvaluateOnboardingTasksUseCase } from './evaluate-onboarding-tasks.use-case';
import { GetOnboardingTasksUseCase } from './get-onboarding-tasks.use-case';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IRecordOnboardingEvidenceUseCase,
      useClass: RecordOnboardingEvidenceUseCase,
    },
    {
      provide: IGetOnboardingTasksUseCase,
      useClass: GetOnboardingTasksUseCase,
    },
    {
      provide: IEvaluateOnboardingTasksUseCase,
      useClass: EvaluateOnboardingTasksUseCase,
    },
  ],
  exports: [
    IRecordOnboardingEvidenceUseCase,
    IGetOnboardingTasksUseCase,
    IEvaluateOnboardingTasksUseCase,
  ],
})
export class OnboardingModule {}
