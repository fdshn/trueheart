import { IGetOnboardingTasksResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOnboardingTasksCommand {
  userId: string;
}

export type IGetOnboardingTasksResult = IGetOnboardingTasksResponseDto;

export interface IGetOnboardingTasksUseCase extends IUseCase<
  IGetOnboardingTasksCommand,
  IGetOnboardingTasksResult
> {}

export const IGetOnboardingTasksUseCase = Symbol('IGetOnboardingTasksUseCase');
