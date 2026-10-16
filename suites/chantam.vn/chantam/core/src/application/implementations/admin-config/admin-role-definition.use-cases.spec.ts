import { AdminRoleProtectedException } from '@/domain/exceptions';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CreateAdminRoleUseCase,
  ListAdminPermissionsUseCase,
  UpdateAdminRoleUseCase,
} from './admin-role-definition.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeRepository(granted: string[]) {
  return {
    hasPermission: jest.fn(async (_userId: string, permission: string) =>
      granted.includes(permission),
    ),
    listRoles: jest.fn(async () => []),
    listPermissions: jest.fn(async () => [
      { code: 'admin.manage', description: 'Quản lý phân quyền' },
    ]),
    createRole: jest.fn(async (_command: unknown) => undefined),
    updateRole: jest.fn(async (_command: unknown) => undefined),
  };
}

describe('Admin role definition', () => {
  it('từ chối xem danh mục permission khi thiếu admin.manage', async () => {
    const repository = makeRepository(['config.read']);
    const useCase = new ListAdminPermissionsUseCase(repository as never);

    await expect(
      useCase.handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listPermissions).not.toHaveBeenCalled();
  });

  it('trả danh mục permission cho người có admin.manage', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new ListAdminPermissionsUseCase(repository as never);

    await expect(useCase.handle({ actorUserId: ActorId })).resolves.toEqual({
      permissions: [
        { code: 'admin.manage', description: 'Quản lý phân quyền' },
      ],
    });
  });

  it('từ chối tạo role khi thiếu admin.manage và không ghi gì', async () => {
    const repository = makeRepository([]);
    const useCase = new CreateAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        role: {
          code: 'CONTENT_EDITOR',
          name: 'Biên tập',
          permissions: [],
          reason: 'Thêm nhóm biên tập',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.createRole).not.toHaveBeenCalled();
  });

  it('tạo role: chuẩn hoá tên, lý do và bỏ permission trùng', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new CreateAdminRoleUseCase(repository as never);

    await useCase.handle({
      actorUserId: ActorId,
      role: {
        code: 'CONTENT_EDITOR',
        name: '  Biên tập  ',
        permissions: ['blog.write', 'blog.write', 'media.read'],
        reason: ' Thêm nhóm biên tập ',
      },
    });

    expect(repository.createRole).toHaveBeenCalledWith({
      actorUserId: ActorId,
      code: 'CONTENT_EDITOR',
      name: 'Biên tập',
      permissions: ['blog.write', 'media.read'],
      reason: 'Thêm nhóm biên tập',
    });
    expect(repository.listRoles).toHaveBeenCalled();
  });

  it('bắt buộc có lý do khi tạo role', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new CreateAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        role: { code: 'X_ROLE', name: 'X', permissions: [], reason: '  ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.createRole).not.toHaveBeenCalled();
  });

  it('không sửa được SUPER_ADMIN từ CMS', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new UpdateAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        roleCode: 'SUPER_ADMIN',
        role: { permissions: [], reason: 'Dọn quyền' },
      }),
    ).rejects.toBeInstanceOf(AdminRoleProtectedException);
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('sửa role phải đổi ít nhất một thứ', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new UpdateAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        roleCode: 'MODERATOR',
        role: { reason: 'Không đổi gì' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('sửa role chỉ chuyển những trường được gửi', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new UpdateAdminRoleUseCase(repository as never);

    await useCase.handle({
      actorUserId: ActorId,
      roleCode: 'MODERATOR',
      role: {
        permissions: ['report.read', 'report.read'],
        reason: 'Bớt quyền xử lý',
      },
    });

    expect(repository.updateRole).toHaveBeenCalledWith({
      actorUserId: ActorId,
      code: 'MODERATOR',
      name: undefined,
      isActive: undefined,
      permissions: ['report.read'],
      reason: 'Bớt quyền xử lý',
    });
  });

  it('từ chối đổi tên thành chuỗi rỗng', async () => {
    const repository = makeRepository(['admin.manage']);
    const useCase = new UpdateAdminRoleUseCase(repository as never);

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        roleCode: 'MODERATOR',
        role: { name: '   ', reason: 'Đổi tên' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.updateRole).not.toHaveBeenCalled();
  });
});
