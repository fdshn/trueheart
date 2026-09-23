import {
  IEvaluateOnboardingTasksCommand,
  IEvaluateOnboardingTasksResult,
  IEvaluateOnboardingTasksUseCase,
  IRecordOnboardingEvidenceUseCase,
} from '@/application/contracts/onboarding';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import { IPromoteOnboardingMemberUseCase } from '@/application/contracts/rank';
import { IQualifyReferralUseCase } from '@/application/contracts/referral';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IOnboardingTaskRepository,
  IUserOnboardingTaskCompletionRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  OnboardingTaskEvidenceTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class EvaluateOnboardingTasksUseCase implements IEvaluateOnboardingTasksUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
    @Inject(IOnboardingTaskRepository)
    private readonly onboardingTasks: IOnboardingTaskRepository,
    @Inject(IUserOnboardingTaskCompletionRepository)
    private readonly completions: IUserOnboardingTaskCompletionRepository,
    @Inject(IRecordOnboardingEvidenceUseCase)
    private readonly recordOnboardingEvidenceUseCase: IRecordOnboardingEvidenceUseCase,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
    @Inject(IPromoteOnboardingMemberUseCase)
    private readonly promoteOnboardingMemberUseCase: IPromoteOnboardingMemberUseCase,
    @Inject(IQualifyReferralUseCase)
    private readonly qualifyReferralUseCase: IQualifyReferralUseCase,
  ) {}

  public async handle(
    command: IEvaluateOnboardingTasksCommand,
  ): Promise<IEvaluateOnboardingTasksResult> {
    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    const initialRank = user.rank;
    const newlyCompletedKeys: string[] = [];
    let promotedToMember = false;

    // 1. Kiểm tra PROFILE_COMPLETE
    if (isProfileComplete(user)) {
      const alreadyCompleted = await this.completions.hasCompletedEvidence(
        user.globalId,
        OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
      );

      if (!alreadyCompleted) {
        const res = await this.recordOnboardingEvidenceUseCase.handle({
          userId: user.globalId,
          evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
        });
        newlyCompletedKeys.push('PROFILE_COMPLETE');
        if (res.promoted) promotedToMember = true;
      }
    }

    // 2. Kiểm tra PHONE_VERIFIED
    if (user.phoneVerifiedAt) {
      const alreadyCompleted = await this.completions.hasCompletedEvidence(
        user.globalId,
        OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
      );

      if (!alreadyCompleted) {
        const res = await this.recordOnboardingEvidenceUseCase.handle({
          userId: user.globalId,
          evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
        });
        newlyCompletedKeys.push('PHONE_VERIFIED');
        if (res.promoted) promotedToMember = true;
      }
    }

    const tasks = await this.onboardingTasks.findUserTaskProgress(
      user.globalId,
    );
    const requiredTasks = tasks.filter((t) => t.required);
    const completedRequired = requiredTasks.filter((t) => t.completed).length;
    const isAllCompleted =
      requiredTasks.length > 0 && completedRequired === requiredTasks.length;

    if (isAllCompleted) {
      await this.appendPointEntryUseCase.handle({
        userId: user.globalId,
        ruleCode: 'ONBOARDING_COMPLETED',
        referenceType: 'ONBOARDING',
        referenceId: user.globalId,
        idempotencyKey: `ONBOARDING_COMPLETED:${user.globalId}`,
        actor: 'SYSTEM',
        source: 'ONBOARDING',
      });
      const promoted = await this.promoteOnboardingMemberUseCase.handle({
        userId: user.globalId,
      });
      if (promoted) promotedToMember = true;
      await this.qualifyReferralUseCase.handle({ refereeId: user.globalId });
    }

    const updatedUser = await this.users.findOneBy({
      globalId: user.globalId,
    });
    const currentRank = updatedUser ? updatedUser.rank : initialRank;
    if (
      !promotedToMember &&
      initialRank === UserRanks.VIEWER &&
      currentRank === UserRanks.MEMBER
    ) {
      promotedToMember = true;
    }

    return {
      tasks,
      newlyCompletedKeys,
      isAllCompleted,
      promotedToMember,
      currentRank,
    };
  }
}
