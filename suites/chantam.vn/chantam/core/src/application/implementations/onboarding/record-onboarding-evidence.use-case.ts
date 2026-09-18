import {
  IRecordOnboardingEvidenceCommand,
  IRecordOnboardingEvidenceResult,
  IRecordOnboardingEvidenceUseCase,
} from '@/application/contracts/onboarding';
import { IPromoteOnboardingMemberUseCase } from '@/application/contracts/rank';
import { IQualifyReferralUseCase } from '@/application/contracts/referral';
import { IUserOnboardingTaskCompletionRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RecordOnboardingEvidenceUseCase implements IRecordOnboardingEvidenceUseCase {
  public constructor(
    @Inject(IUserOnboardingTaskCompletionRepository)
    private readonly completions: IUserOnboardingTaskCompletionRepository,
    @Inject(IPromoteOnboardingMemberUseCase)
    private readonly promoteOnboardingMemberUseCase: IPromoteOnboardingMemberUseCase,
    @Inject(IQualifyReferralUseCase)
    private readonly qualifyReferralUseCase: IQualifyReferralUseCase,
  ) {}

  public async handle(
    command: IRecordOnboardingEvidenceCommand,
  ): Promise<IRecordOnboardingEvidenceResult> {
    const completion =
      await this.completions.recordEvidenceAndDetermineCompletion(command);
    if (!completion.onboardingComplete) return { promoted: false };

    const promoted = await this.promoteOnboardingMemberUseCase.handle({
      userId: command.userId,
    });
    await this.qualifyReferralUseCase.handle({ refereeId: command.userId });

    return { promoted };
  }
}
