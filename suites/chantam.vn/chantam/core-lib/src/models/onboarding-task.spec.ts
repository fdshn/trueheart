import {
  OnboardingActionTargets,
  OnboardingActionTypes,
  OnboardingTaskEvidenceTypes,
} from '../consts';
import { onboardingTaskActionOf } from './onboarding-task';

const Complete = {
  fullName: 'Cư sĩ Minh Tuệ',
  avatarUrl: 'https://cdn.test/a.png',
  phone: '0901234567',
  email: 'minhtue@example.com',
};

describe('onboardingTaskActionOf', () => {
  it('task đã xong: không còn hành động', () => {
    expect(
      onboardingTaskActionOf(
        {
          evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
          completed: true,
        },
        { ...Complete, phone: null },
      ),
    ).toBeNull();
  });

  it('hoàn thiện hồ sơ: mở màn sửa hồ sơ kèm mã trường còn thiếu, theo thứ tự form', () => {
    expect(
      onboardingTaskActionOf(
        {
          evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
          completed: false,
        },
        { ...Complete, avatarUrl: null, email: null },
      ),
    ).toEqual({
      type: OnboardingActionTypes.APP_ROUTE,
      target: OnboardingActionTargets.PROFILE_EDIT,
      params: { missingFields: 'avatarUrl,email' },
    });
  });

  it('xác thực SĐT khi đã có số: mở màn xác thực', () => {
    expect(
      onboardingTaskActionOf(
        {
          evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
          completed: false,
        },
        Complete,
      ),
    ).toEqual({
      type: OnboardingActionTypes.APP_ROUTE,
      target: OnboardingActionTargets.PHONE_VERIFICATION,
      params: {},
    });
  });

  it('xác thực SĐT khi chưa có số: phải nhập số ở hồ sơ trước', () => {
    expect(
      onboardingTaskActionOf(
        {
          evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
          completed: false,
        },
        { ...Complete, phone: null },
      ),
    ).toEqual({
      type: OnboardingActionTypes.APP_ROUTE,
      target: OnboardingActionTargets.PROFILE_EDIT,
      params: { missingFields: 'phone' },
    });
  });

  it('loại task server không biết (dữ liệu lạ trong DB): không đoán, trả null', () => {
    expect(
      onboardingTaskActionOf(
        { evidenceType: 'SOMETHING_ELSE', completed: false },
        Complete,
      ),
    ).toBeNull();
  });
});
