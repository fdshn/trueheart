import {
  OnboardingActionTargets,
  OnboardingActionTypes,
  OnboardingTaskEvidenceTypes,
} from '../consts';
import { IUser, missingProfileFieldKeys } from './user';

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

export interface IOnboardingTaskAction {
  type: OnboardingActionTypes;
  target: OnboardingActionTargets;
  params: Record<string, string>;
}

type ProfileFields = Pick<IUser, 'fullName' | 'avatarUrl' | 'phone' | 'email'>;

const editProfile = (missing: readonly string[]): IOnboardingTaskAction => ({
  type: OnboardingActionTypes.APP_ROUTE,
  target: OnboardingActionTargets.PROFILE_EDIT,
  params: { missingFields: missing.join(',') },
});

/**
 * `Record` trên TOÀN BỘ loại bằng chứng: thêm một loại task mà quên khai hành động là lỗi
 * biên dịch, không phải một nút app không biết mở đi đâu.
 */
const ActionByEvidence: Readonly<
  Record<
    OnboardingTaskEvidenceTypes,
    (user: ProfileFields) => IOnboardingTaskAction
  >
> = {
  [OnboardingTaskEvidenceTypes.PROFILE_COMPLETE]: (user) =>
    editProfile(missingProfileFieldKeys(user)),
  // Chưa có số thì OTP không có chỗ gửi — đưa về hồ sơ nhập số trước.
  [OnboardingTaskEvidenceTypes.PHONE_VERIFIED]: (user) =>
    user.phone
      ? {
          type: OnboardingActionTypes.APP_ROUTE,
          target: OnboardingActionTargets.PHONE_VERIFICATION,
          params: {},
        }
      : editProfile(['phone']),
};

/**
 * Hành động app nên mở cho một task (PR #46 §6). `null` khi task đã xong, hoặc khi loại task
 * lạ với server — không đoán một màn cho dữ liệu mình không hiểu.
 */
export function onboardingTaskActionOf(
  task: { evidenceType: string; completed: boolean },
  user: ProfileFields,
): IOnboardingTaskAction | null {
  if (task.completed) return null;
  const build = (
    ActionByEvidence as Partial<
      Record<string, (user: ProfileFields) => IOnboardingTaskAction>
    >
  )[task.evidenceType];
  return build ? build(user) : null;
}
