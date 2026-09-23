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

export interface IOnboardingTaskProgressDto {
  id: string;
  key: string;
  evidenceType: string;
  title: string;
  description: string;
  required: boolean;
  sortOrder: number;
  completed: boolean;
  completedAt: Date | string | null;
}

export interface IGetOnboardingTasksResponseDto {
  tasks: IOnboardingTaskProgressDto[];
  totalRequired: number;
  completedRequired: number;
  isAllCompleted: boolean;
  currentRank: string;
}

export interface IEvaluateOnboardingTasksResponseDto {
  tasks: IOnboardingTaskProgressDto[];
  newlyCompletedKeys: string[];
  isAllCompleted: boolean;
  promotedToMember: boolean;
  currentRank: string;
}
