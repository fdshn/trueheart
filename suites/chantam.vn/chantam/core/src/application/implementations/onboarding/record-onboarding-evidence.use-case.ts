import {
  IRecordOnboardingEvidenceCommand,
  IRecordOnboardingEvidenceResult,
  IRecordOnboardingEvidenceUseCase,
} from '@/application/contracts/onboarding';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import { IPromoteOnboardingMemberUseCase } from '@/application/contracts/rank';
import { IQualifyReferralUseCase } from '@/application/contracts/referral';
import { IUserOnboardingTaskCompletionRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { appendPointIgnoringPolicy } from '../point/point-policy-errors';

@Injectable()
export class RecordOnboardingEvidenceUseCase implements IRecordOnboardingEvidenceUseCase {
  public constructor(
    @Inject(IUserOnboardingTaskCompletionRepository)
    private readonly completions: IUserOnboardingTaskCompletionRepository,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
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

    // THĂNG HẠNG TRƯỚC, THƯỞNG SAU — thứ tự này là nội dung, không phải hình
    // thức. Đảo lại thì một rule điểm bị tắt sẽ ném trước khi ai kịp lên
    // MEMBER, và người mới không đăng được bài chỉ vì Admin tạm ngưng thưởng.
    const promoted = await this.promoteOnboardingMemberUseCase.handle({
      userId: command.userId,
    });
    await this.qualifyReferralUseCase.handle({ refereeId: command.userId });

    await appendPointIgnoringPolicy(this.appendPointEntryUseCase, {
      userId: command.userId,
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      referenceId: command.userId,
      idempotencyKey: `ONBOARDING_COMPLETED:${command.userId}`,
      actor: 'SYSTEM',
      source: 'ONBOARDING',
    });

    return { promoted };
  }
}
