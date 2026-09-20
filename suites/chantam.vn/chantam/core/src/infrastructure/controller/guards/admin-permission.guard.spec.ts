import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { AdminPermissionGuard } from './admin-permission.guard';
import { RequiredPermissionKey } from './requires-permission.decorator';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeContext(url: string, user?: { userId: string }) {
  return {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ url, user }) }),
  } as never;
}

function makeGuard(options: { required?: string; granted?: boolean }) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === RequiredPermissionKey ? options.required : undefined,
    ),
  };
  const permissions = {
    hasPermission: jest.fn(async () => options.granted ?? false),
  };

  return {
    guard: new AdminPermissionGuard(reflector as never, permissions as never),
    permissions,
  };
}

describe('AdminPermissionGuard', () => {
  it('chặn route admin không khai quyền', async () => {
    // Thêm endpoint admin mà quên decorator thì phải khoá, không phải mở.
    const { guard } = makeGuard({});

    await expect(
      guard.canActivate(
        makeContext('/api/v1/admin/system-configs', { userId: UserId }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cho qua route thường không khai quyền', async () => {
    const { guard } = makeGuard({});

    await expect(
      guard.canActivate(makeContext('/api/v1/posts/nearby')),
    ).resolves.toBe(true);
  });

  it('cho qua khi có đúng quyền đã khai', async () => {
    const { guard, permissions } = makeGuard({
      required: 'config.read',
      granted: true,
    });

    await expect(
      guard.canActivate(
        makeContext('/api/v1/admin/system-configs', { userId: UserId }),
      ),
    ).resolves.toBe(true);
    expect(permissions.hasPermission).toHaveBeenCalledWith(
      UserId,
      'config.read',
    );
  });

  it('chặn khi thiếu quyền đã khai', async () => {
    const { guard } = makeGuard({ required: 'config.write', granted: false });

    await expect(
      guard.canActivate(
        makeContext('/api/v1/admin/system-configs', { userId: UserId }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('chặn khi chưa đăng nhập dù endpoint có khai quyền', async () => {
    const { guard, permissions } = makeGuard({
      required: 'config.read',
      granted: true,
    });

    await expect(
      guard.canActivate(makeContext('/api/v1/admin/system-configs')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.hasPermission).not.toHaveBeenCalled();
  });
});
