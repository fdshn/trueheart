import { PhoneRewardReconcileBatchSize } from '@/application/contracts/point';
import { ReconcilePhoneRewardsUseCase } from './reconcile-phone-rewards.use-case';

const UserA = '10000000-0000-4000-8000-000000000001';
const UserB = '20000000-0000-4000-8000-000000000002';

function makeDeps(userIds: string[]) {
  return {
    ledger: {
      findPhoneVerifiedUsersMissingReward: jest.fn(
        async (_limit: number) => userIds,
      ),
    },
    append: { handle: jest.fn(async () => undefined) },
  };
}

describe('ReconcilePhoneRewardsUseCase', () => {
  it('vá thưởng bằng đúng khoá idempotency của luồng gốc', async () => {
    // Khác khoá là thưởng hai lần cho cùng một lần xác minh.
    const deps = makeDeps([UserA]);
    const useCase = new ReconcilePhoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({ repairedRewards: 1 });

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
    const useCase = new ReconcilePhoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({ repairedRewards: 0 });
    expect(deps.append.handle).not.toHaveBeenCalled();
  });

  it('một người hỏng không chặn những người còn lại', async () => {
    const deps = makeDeps([UserA, UserB]);
    deps.append.handle
      .mockRejectedValueOnce(new Error('ledger sập'))
      .mockResolvedValueOnce(undefined);
    const useCase = new ReconcilePhoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({ repairedRewards: 1 });
    expect(deps.append.handle).toHaveBeenCalledTimes(2);
  });

  it('dùng kích thước lô mặc định khi không truyền', async () => {
    const deps = makeDeps([]);
    const useCase = new ReconcilePhoneRewardsUseCase(
      deps.ledger as never,
      deps.append as never,
    );

    await useCase.handle({});

    expect(
      deps.ledger.findPhoneVerifiedUsersMissingReward,
    ).toHaveBeenCalledWith(PhoneRewardReconcileBatchSize);
  });
});
