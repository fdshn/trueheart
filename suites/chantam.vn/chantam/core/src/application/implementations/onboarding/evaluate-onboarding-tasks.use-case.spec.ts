import { UserNotFoundException } from '@/domain/exceptions';
import {
  OnboardingTaskEvidenceTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { EvaluateOnboardingTasksUseCase } from './evaluate-onboarding-tasks.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('EvaluateOnboardingTasksUseCase', () => {
  it('throws UserNotFoundException if user does not exist', async () => {
    const usersRepo = {
      findOneBy: jest.fn(async () => null),
    };
    const onboardingTasksRepo = { findUserTaskProgress: jest.fn() };
    const completionsRepo = { hasCompletedEvidence: jest.fn() };
    const recordUseCase = { handle: jest.fn() };

    const useCase = new EvaluateOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
      completionsRepo as never,
      recordUseCase as never,
    );

    await expect(useCase.handle({ userId: UserId })).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it('evaluates profile and phone, records newly completed tasks, and detects member promotion', async () => {
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
    ];

    const usersRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({
          globalId: UserId,
          fullName: 'Nguyễn Văn A',
          avatarUrl: 'https://example.com/avatar.jpg',
          email: 'a@example.com',
          phone: '0901234567',
          phoneVerifiedAt: new Date(),
          rank: UserRanks.VIEWER,
        })
        .mockResolvedValueOnce({
          globalId: UserId,
          rank: UserRanks.MEMBER,
        }),
    };

    const onboardingTasksRepo = {
      findUserTaskProgress: jest.fn(async () => mockTasks),
    };

    const completionsRepo = {
      hasCompletedEvidence: jest.fn(async () => false),
    };

    const recordUseCase = {
      handle: jest
        .fn()
        .mockResolvedValueOnce({ promoted: false })
        .mockResolvedValueOnce({ promoted: true }),
    };

    const useCase = new EvaluateOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
      completionsRepo as never,
      recordUseCase as never,
    );

    const result = await useCase.handle({ userId: UserId });

    expect(recordUseCase.handle).toHaveBeenCalledWith({
      userId: UserId,
      evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
    });
    expect(recordUseCase.handle).toHaveBeenCalledWith({
      userId: UserId,
      evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
    });
    expect(result.newlyCompletedKeys).toEqual([
      'PROFILE_COMPLETE',
      'PHONE_VERIFIED',
    ]);
    expect(result.promotedToMember).toBe(true);
    expect(result.currentRank).toBe(UserRanks.MEMBER);
    expect(result.isAllCompleted).toBe(true);
  });
});
