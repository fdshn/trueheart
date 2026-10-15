import { UserNotFoundException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { GetUserPointLedgerUseCase } from './get-user-point-ledger.use-case';

const AdminId = '10000000-0000-4000-8000-0000000000ad';
const UserId = '10000000-0000-4000-8000-000000000001';

function makeDeps(options: { granted?: boolean; user?: unknown } = {}) {
  return {
    ledger: {
      getHistory: jest.fn(async () => ({ entries: [], total: 31 })),
    },
    admin: {
      hasPermission: jest.fn(async () => options.granted ?? true),
    },
    users: {
      findOneBy: jest.fn(async () =>
        options.user === undefined
          ? { globalId: UserId, deletedAt: null }
          : options.user,
      ),
    },
  };
}

function useCase(deps: ReturnType<typeof makeDeps>) {
  return new GetUserPointLedgerUseCase(
    deps.ledger as never,
    deps.admin as never,
    deps.users as never,
  );
}

describe('GetUserPointLedgerUseCase (CMS backlog A7)', () => {
  it('đòi point.read rồi trả sổ điểm của user được hỏi, đúng phân trang', async () => {
    const deps = makeDeps();

    await expect(
      useCase(deps).handle({
        actorUserId: AdminId,
        userId: UserId,
        page: 3,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      entries: [],
      meta: { page: 3, pageSize: 10, total: 31 },
    });
    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      AdminId,
      'point.read',
    );
    // Sổ của NGƯỜI ĐƯỢC HỎI, không phải của Admin đang gọi.
    expect(deps.ledger.getHistory).toHaveBeenCalledWith(UserId, {
      skip: 20,
      take: 10,
    });
  });

  it('thiếu point.read thì 403 và không đọc sổ', async () => {
    const deps = makeDeps({ granted: false });

    await expect(
      useCase(deps).handle({ actorUserId: AdminId, userId: UserId }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.ledger.getHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['không tồn tại', null],
    ['đã xoá', { globalId: UserId, deletedAt: new Date() }],
  ])('user %s thì 404 thay vì một sổ rỗng', async (_name, user) => {
    const deps = makeDeps({ user });

    await expect(
      useCase(deps).handle({ actorUserId: AdminId, userId: UserId }),
    ).rejects.toThrow(UserNotFoundException);
    expect(deps.ledger.getHistory).not.toHaveBeenCalled();
  });
});
