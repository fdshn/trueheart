import { IEvaluateOnboardingTasksResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IEvaluateOnboardingTasksCommand {
  userId: string;
}

export type IEvaluateOnboardingTasksResult =
  IEvaluateOnboardingTasksResponseDto;

export interface IEvaluateOnboardingTasksUseCase extends IUseCase<
  IEvaluateOnboardingTasksCommand,
  IEvaluateOnboardingTasksResult
> {}

export const IEvaluateOnboardingTasksUseCase = Symbol(
  'IEvaluateOnboardingTasksUseCase',
);
