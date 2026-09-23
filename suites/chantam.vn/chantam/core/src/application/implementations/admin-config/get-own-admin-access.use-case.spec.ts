import { IAdminConfigRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { GetOwnAdminAccessUseCase } from './get-own-admin-access.use-case';

const UserId = '11111111-1111-4111-8111-111111111111';

describe('GetOwnAdminAccessUseCase', () => {
  it('trả role và permission đọc lại từ database', async () => {
    const repository = {
      getAccess: jest.fn().mockResolvedValue({
        roles: ['MODERATOR'],
        permissions: ['admin.access', 'post.read'],
      }),
    } as unknown as jest.Mocked<IAdminConfigRepository>;

    await expect(
      new GetOwnAdminAccessUseCase(repository).handle({
        actorUserId: UserId,
        username: 'moderator',
      }),
    ).resolves.toEqual({
      userId: UserId,
      username: 'moderator',
      roles: ['MODERATOR'],
      permissions: ['admin.access', 'post.read'],
    });
  });

  it('từ chối tài khoản không có admin.access', async () => {
    const repository = {
      getAccess: jest.fn().mockResolvedValue({ roles: [], permissions: [] }),
    } as unknown as jest.Mocked<IAdminConfigRepository>;

    await expect(
      new GetOwnAdminAccessUseCase(repository).handle({
        actorUserId: UserId,
        username: 'member',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
