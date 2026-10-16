import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ListAdminGroupsUseCase } from './admin-group-list.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function makeDeps(granted: string[]) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_id: string, code: string) =>
        granted.includes(code),
      ),
    },
    groups: {
      listForAdmin: jest.fn(async () => ({ items: [], total: 7 })),
    },
  };
}

const list = (deps: ReturnType<typeof makeDeps>) =>
  new ListAdminGroupsUseCase(deps.permissions as never, deps.groups as never);

describe('ListAdminGroupsUseCase (CMS A5)', () => {
  it('không có notification.manage lẫn config.read thì 403', async () => {
    const deps = makeDeps(['report.read']);

    await expect(list(deps).handle({ actorUserId: ActorId })).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.groups.listForAdmin).not.toHaveBeenCalled();
  });

  it.each(['notification.manage', 'config.read'])(
    'một mình %s là đủ',
    async (code) => {
      const deps = makeDeps([code]);
      await expect(
        list(deps).handle({ actorUserId: ActorId }),
      ).resolves.toBeDefined();
    },
  );

  it('keyword được cắt trắng; chuỗi trắng thành không lọc', async () => {
    const deps = makeDeps(['config.read']);
    await list(deps).handle({ actorUserId: ActorId, keyword: '  cau giay ' });
    await list(deps).handle({ actorUserId: ActorId, keyword: '   ' });

    expect(deps.groups.listForAdmin).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ keyword: 'cau giay' }),
    );
    expect(deps.groups.listForAdmin).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ keyword: null }),
    );
  });

  it('phân trang theo page/pageSize và trả total', async () => {
    const deps = makeDeps(['config.read']);
    const result = await list(deps).handle({
      actorUserId: ActorId,
      status: 'ACTIVE' as never,
      page: 2,
      pageSize: 5,
    });

    expect(deps.groups.listForAdmin).toHaveBeenCalledWith({
      keyword: null,
      status: 'ACTIVE',
      skip: 5,
      take: 5,
    });
    expect(result.meta).toMatchObject({ page: 2, total: 7 });
  });
});
