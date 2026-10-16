import { DefaultAllocationPolicy } from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetAllocationPolicyUseCase,
  SetAllocationPolicyUseCase,
} from './allocation-policy.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeRepository(
  stored: unknown = null,
  granted: string[] = ['config.read', 'config.write'],
) {
  return {
    hasPermission: jest.fn(async (_id: string, code: string) =>
      granted.includes(code),
    ),
    getConfigValue: jest.fn().mockResolvedValue(stored),
    publishSystemConfig: jest.fn().mockResolvedValue({}),
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: ActorId,
    categoryMatchRequired: true,
    distanceRule: 'RANK_OR_FILTER' as const,
    keywordMatchEnabled: true,
    autoCreateTransaction: false,
    maxSuggestions: 10,
    weights: { sameCategory: 5, keyword: 3, proximity: 2 },
    reason: 'Ưu tiên cùng danh mục',
    ...overrides,
  };
}

describe(GetAllocationPolicyUseCase.name, () => {
  it('đòi config.read', async () => {
    const repository = makeRepository(null, []);

    await expect(
      new GetAllocationPolicyUseCase(repository as never).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.getConfigValue).not.toHaveBeenCalled();
  });

  it('chưa publish thì trả mặc định và isConfigured false', async () => {
    const repository = makeRepository(null);

    const result = await new GetAllocationPolicyUseCase(
      repository as never,
    ).handle({ actorUserId: ActorId });

    expect(repository.getConfigValue).toHaveBeenCalledWith('allocation.policy');
    expect(result).toEqual({
      policy: DefaultAllocationPolicy,
      isConfigured: false,
    });
  });

  it('đã publish một bản rỗng vẫn là isConfigured true', async () => {
    const result = await new GetAllocationPolicyUseCase(
      makeRepository({}) as never,
    ).handle({ actorUserId: ActorId });

    expect(result).toEqual({
      policy: DefaultAllocationPolicy,
      isConfigured: true,
    });
  });

  it('trả bản ĐÃ chuẩn hoá chứ không phải giá trị thô', async () => {
    const result = await new GetAllocationPolicyUseCase(
      makeRepository({
        distanceRule: 'KHÔNG_CÓ',
        maxSuggestions: 500,
        weights: { sameCategory: 1, keyword: 1, proximity: 2 },
      }) as never,
    ).handle({ actorUserId: ActorId });

    expect(result.policy).toEqual({
      ...DefaultAllocationPolicy,
      maxSuggestions: 100,
      weights: { sameCategory: 0.25, keyword: 0.25, proximity: 0.5 },
    });
  });
});

describe(SetAllocationPolicyUseCase.name, () => {
  it('đòi config.write và không ghi gì khi thiếu quyền', async () => {
    const repository = makeRepository(null, ['config.read']);

    await expect(
      new SetAllocationPolicyUseCase(repository as never).handle(command()),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('ghi bản đã chuẩn hoá (trọng số chia lại) vào đúng khoá kèm lý do', async () => {
    const repository = makeRepository();

    const result = await new SetAllocationPolicyUseCase(
      repository as never,
    ).handle(command());

    const policy = {
      categoryMatchRequired: true,
      distanceRule: 'RANK_OR_FILTER',
      keywordMatchEnabled: true,
      autoCreateTransaction: false,
      maxSuggestions: 10,
      weights: { sameCategory: 0.5, keyword: 0.3, proximity: 0.2 },
    };
    expect(repository.publishSystemConfig).toHaveBeenCalledWith({
      actorUserId: ActorId,
      key: 'allocation.policy',
      value: policy,
      valueType: 'JSON',
      reason: 'Ưu tiên cùng danh mục',
    });
    expect(result).toEqual({ policy, isConfigured: true });
  });

  it('tắt cả lọc danh mục lẫn từ khoá thì từ chối và không ghi', async () => {
    const repository = makeRepository();

    await expect(
      new SetAllocationPolicyUseCase(repository as never).handle(
        command({ categoryMatchRequired: false, keywordMatchEnabled: false }),
      ),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('maxSuggestions ngoài khoảng được kẹp về 1–100 trước khi ghi', async () => {
    const repository = makeRepository();
    const useCase = new SetAllocationPolicyUseCase(repository as never);

    await useCase.handle(command({ maxSuggestions: 0 }));
    await useCase.handle(command({ maxSuggestions: 1000 }));

    expect(
      repository.publishSystemConfig.mock.calls.map(
        ([call]) =>
          (call as { value: { maxSuggestions: number } }).value.maxSuggestions,
      ),
    ).toEqual([1, 100]);
  });

  it('trọng số toàn 0 hoặc luật khoảng cách lạ rơi về mặc định', async () => {
    const repository = makeRepository();

    const result = await new SetAllocationPolicyUseCase(
      repository as never,
    ).handle(
      command({
        distanceRule: 'BẤT_KỲ',
        weights: { sameCategory: 0, keyword: 0, proximity: 0 },
      }),
    );

    expect(result.policy.distanceRule).toBe('FILTER_ONLY');
    expect(result.policy.weights).toEqual(DefaultAllocationPolicy.weights);
  });
});
