import { GetOwnEntitlementsUseCase } from './get-own-entitlements.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const summary = { rank: 'GOLD', capabilities: [] };

function makeDeps(
  groupCreation: { canCreateGroup: boolean; reasonCode: string | null } = {
    canCreateGroup: true,
    reasonCode: null,
  },
) {
  return {
    entitlements: { getOwnEntitlements: jest.fn().mockResolvedValue(summary) },
    groupCreation: { evaluate: jest.fn().mockResolvedValue(groupCreation) },
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new GetOwnEntitlementsUseCase(
    deps.entitlements as never,
    deps.groupCreation as never,
  );

describe(GetOwnEntitlementsUseCase.name, () => {
  it('trả quyền của chính người gọi kèm kết luận tạo nhóm', async () => {
    const deps = makeDeps();

    await expect(build(deps).handle({ userId: UserId })).resolves.toEqual({
      entitlements: summary,
      groupCreation: { canCreateGroup: true, reasonCode: null },
    });
    expect(deps.entitlements.getOwnEntitlements).toHaveBeenCalledWith(UserId);
    expect(deps.groupCreation.evaluate).toHaveBeenCalledWith(UserId);
  });

  it('chưa tạo được nhóm thì trả nguyên reasonCode của GroupCreationEligibility', async () => {
    const deps = makeDeps({
      canCreateGroup: false,
      reasonCode: 'GROUP_DEFAULT_LOCATION_REQUIRED',
    });

    await expect(build(deps).handle({ userId: UserId })).resolves.toEqual({
      entitlements: summary,
      groupCreation: {
        canCreateGroup: false,
        reasonCode: 'GROUP_DEFAULT_LOCATION_REQUIRED',
      },
    });
  });

  it('xét tạo nhóm lỗi thì cả lượt đọc lỗi theo', async () => {
    const deps = makeDeps();
    const failure = new Error('db down');
    deps.groupCreation.evaluate.mockRejectedValue(failure);

    await expect(build(deps).handle({ userId: UserId })).rejects.toBe(failure);
  });
});
