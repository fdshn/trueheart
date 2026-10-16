import { EntitlementPolicyUnavailableException } from '@/domain/exceptions';
import { PublishEntitlementPolicyUseCase } from './publish-entitlement-policy.use-case';

const ActorId = '10000000-0000-4000-8000-000000000001';
const capabilities = [
  { rank: 'GOLD', capabilityCode: 'CREATE_GROUP', allowed: true },
] as never[];
const published = {
  revisionId: 8,
  effectiveFrom: new Date('2026-10-16T00:00:00Z'),
  changeReason: 'Cho GOLD tạo nhóm',
  capabilities: [],
};

describe(PublishEntitlementPolicyUseCase.name, () => {
  it('chuyển đúng người, lý do và bản vá cho repository rồi trả bản mới', async () => {
    const repository = {
      publishPolicyRevision: jest.fn().mockResolvedValue(published),
    };
    const useCase = new PublishEntitlementPolicyUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        changeReason: 'Cho GOLD tạo nhóm',
        capabilities,
      }),
    ).resolves.toEqual({ policy: published });
    expect(repository.publishPolicyRevision).toHaveBeenCalledTimes(1);
    expect(repository.publishPolicyRevision).toHaveBeenCalledWith({
      actorUserId: ActorId,
      changeReason: 'Cho GOLD tạo nhóm',
      capabilities,
    });
  });

  it('không lọt khoá lạ nào từ command xuống repository', async () => {
    const repository = {
      publishPolicyRevision: jest.fn().mockResolvedValue(published),
    };
    const useCase = new PublishEntitlementPolicyUseCase(repository as never);

    await useCase.handle({
      actorUserId: ActorId,
      changeReason: 'x',
      capabilities,
      revisionId: 999,
    } as never);

    expect(
      Object.keys(repository.publishPolicyRevision.mock.calls[0][0]).sort(),
    ).toEqual(['actorUserId', 'capabilities', 'changeReason']);
  });

  it('repository từ chối thì lỗi nổi lên nguyên vẹn', async () => {
    const repository = {
      publishPolicyRevision: jest
        .fn()
        .mockRejectedValue(new EntitlementPolicyUnavailableException()),
    };
    const useCase = new PublishEntitlementPolicyUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId, changeReason: 'x', capabilities }),
    ).rejects.toBeInstanceOf(EntitlementPolicyUnavailableException);
  });
});
