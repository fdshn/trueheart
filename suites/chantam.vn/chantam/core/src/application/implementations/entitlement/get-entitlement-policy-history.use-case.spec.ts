import { GetEntitlementPolicyHistoryUseCase } from './get-entitlement-policy-history.use-case';

function build() {
  const entitlements = {
    listPolicyHistory: jest.fn().mockResolvedValue([{ revisionId: 1 }]),
  };
  return {
    entitlements,
    useCase: new GetEntitlementPolicyHistoryUseCase(entitlements as never),
  };
}

describe(GetEntitlementPolicyHistoryUseCase.name, () => {
  it('không gửi limit thì lấy 20 bản và trả nguyên danh sách', async () => {
    const { entitlements, useCase } = build();

    await expect(useCase.handle({ actorUserId: 'actor' })).resolves.toEqual({
      revisions: [{ revisionId: 1 }],
    });
    expect(entitlements.listPolicyHistory).toHaveBeenCalledWith(20);
  });

  it.each([
    ['vượt trần bị kẹp về 100', 5000, 100],
    ['đúng trần giữ nguyên', 100, 100],
    ['0 nâng lên 1', 0, 1],
    ['số âm nâng lên 1', -3, 1],
    ['số lẻ bị cắt phần thập phân', 7.9, 7],
    ['giá trị hợp lệ giữ nguyên', 35, 35],
  ])('limit %s', async (_label, limit, expected) => {
    const { entitlements, useCase } = build();

    await useCase.handle({ actorUserId: 'actor', limit });

    expect(entitlements.listPolicyHistory).toHaveBeenCalledWith(expected);
  });
});
