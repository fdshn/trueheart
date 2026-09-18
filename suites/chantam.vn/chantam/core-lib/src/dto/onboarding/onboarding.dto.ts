import { OnboardingTaskEvidenceTypes } from '../../consts';

export interface IOnboardingTaskDto {
  taskId: string;
  key: OnboardingTaskEvidenceTypes;
  title: string;
  description: string;
  required: boolean;
  active: boolean;
  sortOrder: number;
  completedAt: Date | null;
}

export interface ICreateOnboardingTaskDto {
  key: OnboardingTaskEvidenceTypes;
  title: string;
  description: string;
  required?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export interface ICreateOnboardingTaskBodyDto {
  onboardingTask: ICreateOnboardingTaskDto;
}

export interface ICreateOnboardingTaskResponseDto {
  onboardingTask: IOnboardingTaskDto;
}

export interface IUpdateOnboardingTaskDto {
  title?: string;
  description?: string;
  required?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export interface IUpdateOnboardingTaskBodyDto {
  onboardingTask: IUpdateOnboardingTaskDto;
}

export interface IUpdateOnboardingTaskResponseDto {
  onboardingTask: IOnboardingTaskDto;
}

export interface IGetOnboardingTasksResponseDto {
  tasks: IOnboardingTaskDto[];
  completedRequiredCount: number;
  requiredCount: number;
  isComplete: boolean;
}
