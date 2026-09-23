import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { OnboardingController } from './onboarding.controller';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('OnboardingController', () => {
  it('returns onboarding tasks and completion summary for the authenticated user', async () => {
    const mockTasks = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        key: 'PROFILE_COMPLETE',
        evidenceType: 'PROFILE_COMPLETE',
        title: 'Hoàn thiện hồ sơ',
        description: 'Cập nhật họ tên, ảnh đại diện, email và số điện thoại.',
        required: true,
        sortOrder: 1,
        completed: false,
        completedAt: null,
      },
    ];

    const getTasksUseCase = {
      handle: jest.fn(async () => ({
        tasks: mockTasks,
        totalRequired: 1,
        completedRequired: 0,
        isAllCompleted: false,
        currentRank: UserRanks.VIEWER,
      })),
    };
    const evaluateTasksUseCase = {
      handle: jest.fn(),
    };

    const controller = new OnboardingController(
      getTasksUseCase as never,
      evaluateTasksUseCase as never,
    );

    const response = await controller.getTasks({ userId: UserId } as never);

    expect(getTasksUseCase.handle).toHaveBeenCalledWith({ userId: UserId });
    expect(response.body).toEqual({
      tasks: mockTasks,
      totalRequired: 1,
      completedRequired: 0,
      isAllCompleted: false,
      currentRank: UserRanks.VIEWER,
    });
  });

  it('evaluates onboarding tasks and triggers evaluate flow', async () => {
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
        completedAt: new Date().toISOString(),
      },
    ];

    const getTasksUseCase = {
      handle: jest.fn(),
    };
    const evaluateTasksUseCase = {
      handle: jest.fn(async () => ({
        tasks: mockTasks,
        newlyCompletedKeys: ['PROFILE_COMPLETE'],
        isAllCompleted: true,
        promotedToMember: true,
        currentRank: UserRanks.MEMBER,
      })),
    };

    const controller = new OnboardingController(
      getTasksUseCase as never,
      evaluateTasksUseCase as never,
    );

    const response = await controller.evaluateTasks({
      userId: UserId,
    } as never);

    expect(evaluateTasksUseCase.handle).toHaveBeenCalledWith({
      userId: UserId,
    });
    expect(response.body).toEqual({
      tasks: mockTasks,
      newlyCompletedKeys: ['PROFILE_COMPLETE'],
      isAllCompleted: true,
      promotedToMember: true,
      currentRank: UserRanks.MEMBER,
    });
  });
});
