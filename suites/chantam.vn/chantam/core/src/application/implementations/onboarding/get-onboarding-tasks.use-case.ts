import {
  IGetOnboardingTasksCommand,
  IGetOnboardingTasksResult,
  IGetOnboardingTasksUseCase,
} from '@/application/contracts/onboarding';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IOnboardingTaskRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOnboardingTasksUseCase implements IGetOnboardingTasksUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
    @Inject(IOnboardingTaskRepository)
    private readonly onboardingTasks: IOnboardingTaskRepository,
  ) {}

  public async handle(
    command: IGetOnboardingTasksCommand,
  ): Promise<IGetOnboardingTasksResult> {
    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    const tasks = await this.onboardingTasks.findUserTaskProgress(
      user.globalId,
    );
    const requiredTasks = tasks.filter((t) => t.required);
    const completedRequired = requiredTasks.filter((t) => t.completed).length;
    const isAllCompleted =
      requiredTasks.length > 0 && completedRequired === requiredTasks.length;

    return {
      tasks,
      totalRequired: requiredTasks.length,
      completedRequired,
      isAllCompleted,
      currentRank: user.rank,
    };
  }
}
