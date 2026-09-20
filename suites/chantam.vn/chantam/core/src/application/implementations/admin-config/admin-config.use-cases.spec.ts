import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetAdminAuditLogsUseCase,
  GetAdminConfigsUseCase,
  PublishAdminConfigUseCase,
} from './admin-config.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeRepository(granted: string[]) {
  return {
    hasPermission: jest.fn(async (_userId: string, permission: string) =>
      granted.includes(permission),
    ),
    getPublishedConfigs: jest.fn(async () => []),
    publishSystemConfig: jest.fn(async () => ({
      id: 1,
      key: 'discovery.default_radius_meters',
      value: 5000,
      valueType: 'INTEGER',
      version: 2,
      effectiveFrom: new Date(),
      sensitive: false,
    })),
    getAuditLogs: jest.fn(async () => []),
  };
}

const ValidConfig = {
  key: 'discovery.default_radius_meters',
  value: 5000,
  valueType: 'INTEGER',
  reason: 'Mở rộng bán kính mặc định',
};

describe('Admin config authorization', () => {
  it('từ chối đọc cấu hình khi thiếu config.read', async () => {
    const repository = makeRepository([]);
    const useCase = new GetAdminConfigsUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'config.read',
    );
    expect(repository.getPublishedConfigs).not.toHaveBeenCalled();
  });

  it('cho đọc cấu hình khi có config.read', async () => {
    const repository = makeRepository(['config.read']);
    const useCase = new GetAdminConfigsUseCase(repository as never);

    await expect(useCase.handle({ actorUserId: ActorId })).resolves.toEqual({
      configs: [],
    });
  });

  it('từ chối publish khi thiếu config.write và không ghi gì', async () => {
    const repository = makeRepository(['config.read']);
    const useCase = new PublishAdminConfigUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId, systemConfig: ValidConfig }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('từ chối xem audit khi thiếu audit.read', async () => {
    const repository = makeRepository(['config.read', 'config.write']);
    const useCase = new GetAdminAuditLogsUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId, page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getAuditLogs).not.toHaveBeenCalled();
  });

  it('publish thành công thì ghi kèm người thực hiện', async () => {
    const repository = makeRepository(['config.write']);
    const useCase = new PublishAdminConfigUseCase(repository as never);

    await useCase.handle({ actorUserId: ActorId, systemConfig: ValidConfig });

    expect(repository.publishSystemConfig).toHaveBeenCalledWith({
      actorUserId: ActorId,
      ...ValidConfig,
    });
  });
});

describe('Admin config input validation', () => {
  // Dữ liệu sai KHÔNG phải là thiếu quyền. Trả 403 cho một payload hỏng khiến
  // admin đi tìm quyền bị thiếu trong khi thứ cần sửa là body.
  const cases: [string, Record<string, unknown>][] = [
    [
      'key không nằm trong danh sách hỗ trợ',
      { key: 'point.secret_multiplier' },
    ],
    ['valueType không phải INTEGER', { valueType: 'STRING' }],
    ['value không phải số nguyên', { value: 12.5 }],
    ['value âm', { value: -1 }],
  ];

  for (const [name, override] of cases)
    it(`báo lỗi dữ liệu chứ không phải thiếu quyền khi ${name}`, async () => {
      const repository = makeRepository(['config.write']);
      const useCase = new PublishAdminConfigUseCase(repository as never);

      const error = await useCase
        .handle({
          actorUserId: ActorId,
          systemConfig: { ...ValidConfig, ...override } as never,
        })
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ForbiddenException);
      expect(repository.publishSystemConfig).not.toHaveBeenCalled();
    });
});
