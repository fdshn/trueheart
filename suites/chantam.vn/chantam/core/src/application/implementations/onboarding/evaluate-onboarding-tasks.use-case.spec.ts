import {
  PointRuleUnavailableException,
  UserNotFoundException,
} from '@/domain/exceptions';
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
    const points = { handle: jest.fn() };
    const ranks = { handle: jest.fn() };
    const referrals = { handle: jest.fn() };

    const useCase = new EvaluateOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
      completionsRepo as never,
      recordUseCase as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle({ userId: UserId })).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it('evaluates profile and phone, records newly completed tasks, awards points, and detects member promotion', async () => {
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

    const points = { handle: jest.fn(async () => ({})) };
    const ranks = { handle: jest.fn(async () => true) };
    const referrals = { handle: jest.fn(async () => undefined) };

    const useCase = new EvaluateOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
      completionsRepo as never,
      recordUseCase as never,
      points as never,
      ranks as never,
      referrals as never,
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
    expect(points.handle).toHaveBeenCalledWith({
      userId: UserId,
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      referenceId: UserId,
      idempotencyKey: `ONBOARDING_COMPLETED:${UserId}`,
      actor: 'SYSTEM',
      source: 'ONBOARDING',
    });
    expect(result.newlyCompletedKeys).toEqual([
      'PROFILE_COMPLETE',
      'PHONE_VERIFIED',
    ]);
    expect(result.promotedToMember).toBe(true);
    expect(result.currentRank).toBe(UserRanks.MEMBER);
    expect(result.isAllCompleted).toBe(true);
  });
  it('rule điểm bị tắt VẪN thăng hạng, và thăng hạng đi TRƯỚC cộng điểm', async () => {
    // Lỗi chặn đã sửa 29/09: cộng điểm từng đứng trước thăng hạng và không nuốt
    // ngoại lệ chính sách, nên Admin tắt `ONBOARDING_COMPLETED` là không ai lên
    // được MEMBER — tức không ai đăng được bài.
    const order: string[] = [];

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
        .mockResolvedValueOnce({ globalId: UserId, rank: UserRanks.MEMBER }),
    };
    const onboardingTasksRepo = {
      findUserTaskProgress: jest.fn(async () => [
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
      ]),
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
    const points = {
      handle: jest.fn(async () => {
        order.push('points');
        throw new PointRuleUnavailableException('ONBOARDING_COMPLETED');
      }),
    };
    const ranks = {
      handle: jest.fn(async () => {
        order.push('rank');
        return true;
      }),
    };
    const referrals = { handle: jest.fn(async () => undefined) };

    const useCase = new EvaluateOnboardingTasksUseCase(
      usersRepo as never,
      onboardingTasksRepo as never,
      completionsRepo as never,
      recordUseCase as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    const result = await useCase.handle({ userId: UserId });

    expect(order).toEqual(['rank', 'points']);
    expect(ranks.handle).toHaveBeenCalled();
    expect(referrals.handle).toHaveBeenCalled();
    expect(result.promotedToMember).toBe(true);
  });
});
