import { UserNotFoundException } from '@/domain/exceptions';
import {
  OnboardingActionTargets,
  OnboardingActionTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { GetOnboardingTasksUseCase } from './get-onboarding-tasks.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOnboardingTasksUseCase', () => {
  it('throws UserNotFoundException if user does not exist', async () => {
    const usersRepo = {
      findOneBy: jest.fn(async () => null),
    };
    const onboardingTasksRepo = {
      findUserTaskProgress: jest.fn(),
    };

    const useCase = new GetOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
    );

    await expect(useCase.handle({ userId: UserId })).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it('returns task progress and calculated summary', async () => {
    const mockTasks = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        key: 'PROFILE_COMPLETE',
        evidenceType: 'PROFILE_COMPLETE',
        title: 'Hoàn thiện hồ sơ',
        description: 'Cập nhật họ tên, ảnh đại diện, email và số điện thoại.',
        required: true,
        sortOrder: 1,
        completed: true,
        completedAt: new Date(),
      },
      {
        id: '40000000-0000-4000-8000-000000000002',
        key: 'PHONE_VERIFIED',
        evidenceType: 'PHONE_VERIFIED',
        title: 'Xác thực số điện thoại',
        description: 'Xác nhận số điện thoại bằng mã OTP.',
        required: true,
        sortOrder: 2,
        completed: false,
        completedAt: null,
      },
    ];

    const usersRepo = {
      findOneBy: jest.fn(async () => ({
        globalId: UserId,
        rank: UserRanks.VIEWER,
        fullName: 'Cư sĩ Minh Tuệ',
        avatarUrl: 'https://cdn.test/a.png',
        phone: '0901234567',
        email: 'minhtue@example.com',
      })),
    };
    const onboardingTasksRepo = {
      findUserTaskProgress: jest.fn(async () => mockTasks),
    };

    const useCase = new GetOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
    );

    const result = await useCase.handle({ userId: UserId });

    // Task đã xong không còn hành động; task chưa xong mở đúng màn trong allow-list (PR #46 §6).
    expect(result).toEqual({
      tasks: [
        { ...mockTasks[0], action: null },
        {
          ...mockTasks[1],
          action: {
            type: OnboardingActionTypes.APP_ROUTE,
            target: OnboardingActionTargets.PHONE_VERIFICATION,
            params: {},
          },
        },
      ],
      totalRequired: 2,
      completedRequired: 1,
      isAllCompleted: false,
      currentRank: UserRanks.VIEWER,
    });
  });
});
