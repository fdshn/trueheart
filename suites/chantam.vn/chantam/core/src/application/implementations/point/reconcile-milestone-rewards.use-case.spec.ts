import { MilestoneRewardReconcileBatchSize } from '@/application/contracts/point';
import { ReconcileMilestoneRewardsUseCase } from './reconcile-milestone-rewards.use-case';

const UserA = '10000000-0000-4000-8000-000000000001';
const UserB = '20000000-0000-4000-8000-000000000002';

function makeDeps(
  userIds: string[],
  extra: { onboarded?: string[]; pendingReferees?: string[] } = {},
) {
  return {
    ledger: {
      findPhoneVerifiedUsersMissingReward: jest.fn(
        async (_limit: number) => userIds,
      ),
      findOnboardedUsersMissingReward: jest.fn(
        async (_limit: number) => extra.onboarded ?? [],
      ),
    },
    append: { handle: jest.fn(async () => undefined) },
    referrals: {
      findPendingQualifications: jest.fn(
        async (_limit: number) => extra.pendingReferees ?? [],
      ),
      qualifyAndAward: jest.fn(async () => ({ qualified: true })),
    },
  };
}

/** Kết quả rỗng của hai lượt quét mới, để từng phép kiểm chỉ nói về phần nó lo. */
const NoOtherRepairs = { repairedOnboarding: 0, repairedReferrals: 0 };

describe('ReconcileMilestoneRewardsUseCase', () => {
  it('vá thưởng bằng đúng khoá idempotency của luồng gốc', async () => {
    // Khác khoá là thưởng hai lần cho cùng một lần xác minh.
    const deps = makeDeps([UserA]);
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 1,
      ...NoOtherRepairs,
    });

    expect(deps.append.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UserA,
        ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
        idempotencyKey: `PHONE_VERIFIED_FIRST_TIME:${UserA}`,
      }),
    );
  });

  it('không có ai thiếu thưởng thì không ghi gì', async () => {
    const deps = makeDeps([]);
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 0,
      ...NoOtherRepairs,
    });
    expect(deps.append.handle).not.toHaveBeenCalled();
  });

  it('một người hỏng không chặn những người còn lại', async () => {
    const deps = makeDeps([UserA, UserB]);
    deps.append.handle
      .mockRejectedValueOnce(new Error('ledger sập'))
      .mockResolvedValueOnce(undefined);
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 1,
      ...NoOtherRepairs,
    });
    expect(deps.append.handle).toHaveBeenCalledTimes(2);
  });

  it('dùng kích thước lô mặc định khi không truyền', async () => {
    const deps = makeDeps([]);
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await useCase.handle({});

    expect(
      deps.ledger.findPhoneVerifiedUsersMissingReward,
    ).toHaveBeenCalledWith(MilestoneRewardReconcileBatchSize);
  });

  it('vá thưởng onboarding bằng đúng khoá của luồng gốc', async () => {
    const deps = makeDeps([], { onboarded: [UserB] });
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 0,
      repairedOnboarding: 1,
      repairedReferrals: 0,
    });
    expect(deps.append.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UserB,
        ruleCode: 'ONBOARDING_COMPLETED',
        idempotencyKey: `ONBOARDING_COMPLETED:${UserB}`,
      }),
    );
  });

  it('đánh dấu hợp lệ lại lượt giới thiệu đang treo', async () => {
    const deps = makeDeps([], { pendingReferees: [UserA] });
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 0,
      repairedOnboarding: 0,
      repairedReferrals: 1,
    });
    expect(deps.referrals.qualifyAndAward).toHaveBeenCalledWith({
      refereeId: UserA,
    });
  });

  it('lượt giới thiệu vẫn hoãn thì KHÔNG tính là đã vá', async () => {
    // Rule còn tắt: `qualifyAndAward` trả `qualified: false` và để nguyên dòng
    // đó cho lần chạy sau. Đếm nó là đã vá thì người vận hành tưởng xong rồi.
    const deps = makeDeps([], { pendingReferees: [UserA] });
    deps.referrals.qualifyAndAward.mockResolvedValueOnce({ qualified: false });
    const useCase = new ReconcileMilestoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
      deps.referrals as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      repairedRewards: 0,
      repairedOnboarding: 0,
      repairedReferrals: 0,
    });
  });
});
