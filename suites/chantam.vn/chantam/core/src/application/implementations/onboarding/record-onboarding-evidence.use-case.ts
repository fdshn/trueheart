import {
  IRecordOnboardingEvidenceCommand,
  IRecordOnboardingEvidenceResult,
  IRecordOnboardingEvidenceUseCase,
} from '@/application/contracts/onboarding';
import { IUserOnboardingTaskCompletionRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RecordOnboardingEvidenceUseCase implements IRecordOnboardingEvidenceUseCase {
  public constructor(
    @Inject(IUserOnboardingTaskCompletionRepository)
    private readonly completions: IUserOnboardingTaskCompletionRepository,
  ) {}

  public async handle(
    command: IRecordOnboardingEvidenceCommand,
  ): Promise<IRecordOnboardingEvidenceResult> {
    return this.completions.recordEvidenceAndPromoteMember(command);
  }
}
