import { EntitlementPolicyUnavailableException } from '@/domain/exceptions';
import { GetEntitlementPolicyUseCase } from './get-entitlement-policy.use-case';

const revision = {
  revisionId: 7,
  effectiveFrom: new Date('2026-10-01T00:00:00Z'),
  changeReason: 'Mở quota quý IV',
  capabilities: [],
};

describe(GetEntitlementPolicyUseCase.name, () => {
  it('trả đúng bản chính sách chung đang hiệu lực, không lọc theo người gọi', async () => {
    const repository = {
      getPolicyRevision: jest.fn().mockResolvedValue(revision),
    };
    const useCase = new GetEntitlementPolicyUseCase(repository as never);

    await expect(useCase.handle({ actorUserId: 'actor' })).resolves.toEqual({
      policy: revision,
    });
    expect(repository.getPolicyRevision).toHaveBeenCalledTimes(1);
    expect(repository.getPolicyRevision).toHaveBeenCalledWith();
  });

  it('chưa có bản hiệu lực thì lỗi từ repository nổi lên nguyên vẹn', async () => {
    const repository = {
      getPolicyRevision: jest
        .fn()
        .mockRejectedValue(new EntitlementPolicyUnavailableException()),
    };
    const useCase = new GetEntitlementPolicyUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: 'actor' }),
    ).rejects.toBeInstanceOf(EntitlementPolicyUnavailableException);
  });
});
