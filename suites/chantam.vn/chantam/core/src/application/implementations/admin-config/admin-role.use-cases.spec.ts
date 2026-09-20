import { SelfRoleChangeException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  AssignAdminRoleUseCase,
  ListAdminRolesUseCase,
} from './admin-role.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const TargetId = '20000000-0000-4000-8000-000000000002';

function makeRepository(granted: string[]) {
  return {
    hasPermission: jest.fn(async (_userId: string, permission: string) =>
      granted.includes(permission),
    ),
    listRoles: jest.fn(async () => [
      {
        code: 'SUPER_ADMIN',
        name: 'Quản trị toàn hệ thống',
        isActive: true,
        permissions: ['admin.manage'],
      },
    ]),
    grantRole: jest.fn(async (_assignment: unknown) => undefined),
    revokeRole: jest.fn(async (_assignment: unknown) => undefined),
  };
}

const Assignment = { roleCode: 'POLICY_ADMIN', reason: 'Bổ nhiệm phụ trách' };

describe('Admin role management', () => {
  it('từ chối xem role khi thiếu admin.manage', async () => {
    const repository = makeRepository([]);
    const useCase = new ListAdminRolesUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listRoles).not.toHaveBeenCalled();
  });

  it('từ chối gán role khi thiếu admin.manage và không ghi gì', async () => {
    const repository = makeRepository(['config.read']);
    const useCase = new AssignAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        targetUserId: TargetId,
        assignment: Assignment,
        grant: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.grantRole).not.toHaveBeenCalled();
  });

  it('chặn tự thay đổi quyền của chính mình', async () => {
    // Vừa là đường tự nâng quyền, vừa là đường tự khoá mình ra ngoài.
    const repository = makeRepository(['admin.manage']);
    const useCase = new AssignAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        targetUserId: ActorId,
        assignment: Assignment,
        grant: true,
      }),
    ).rejects.toBeInstanceOf(SelfRoleChangeException);
    expect(repository.grantRole).not.toHaveBeenCalled();
  });

  it('bắt buộc có lý do khi đổi quyền', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new AssignAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        targetUserId: TargetId,
        assignment: { roleCode: 'POLICY_ADMIN', reason: '  ' },
        grant: true,
      }),
    ).rejects.toThrow();
    expect(repository.grantRole).not.toHaveBeenCalled();
  });

  it('cấp role kèm người thực hiện và lý do', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new AssignAdminRoleUseCase(repository as never);

    await useCase.handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      assignment: Assignment,
      grant: true,
    });

    expect(repository.grantRole).toHaveBeenCalledWith({
      actorUserId: ActorId,
      targetUserId: TargetId,
      roleCode: 'POLICY_ADMIN',
      reason: 'Bổ nhiệm phụ trách',
    });
    expect(repository.revokeRole).not.toHaveBeenCalled();
  });

  it('thu hồi role đi đúng đường revoke', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new AssignAdminRoleUseCase(repository as never);

    await useCase.handle({
      actorUserId: ActorId,
      targetUserId: TargetId,
      assignment: Assignment,
      grant: false,
    });

    expect(repository.revokeRole).toHaveBeenCalledTimes(1);
    expect(repository.grantRole).not.toHaveBeenCalled();
  });
});
