import { OnboardingTaskEvidenceTypes } from '../consts';

export interface IOnboardingTask {
  key: OnboardingTaskEvidenceTypes;
  title: string;
  description: string;
  evidenceType: OnboardingTaskEvidenceTypes;
  required: boolean;
  active: boolean;
  sortOrder: number;
}

export interface IUserOnboardingTaskCompletion {
  userId: string;
  taskId: string;
  completedAt: Date;
  evidenceRef: string | null;
}
