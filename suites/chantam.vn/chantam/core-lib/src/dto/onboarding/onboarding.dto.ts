import {
  OnboardingActionTargets,
  OnboardingActionTypes,
  OnboardingTaskEvidenceTypes,
} from '../../consts';

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

/** PR #46 §6 — xem `onboardingTaskActionOf`. */
export interface IOnboardingTaskActionDto {
  type: OnboardingActionTypes;
  target: OnboardingActionTargets;
  params: Record<string, string>;
}

/** Một dòng tiến độ như repository đọc ra — chưa có `action`, use case gắn vào. */
export type IOnboardingTaskProgressRow = Omit<
  IOnboardingTaskProgressDto,
  'action'
>;

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
  /** `null` khi task đã xong. */
  action: IOnboardingTaskActionDto | null;
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
