import {
  GroupAlreadyDissolvedException,
  GroupNotFoundException,
} from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  DissolveAdminGroupUseCase,
  GetAdminGroupUseCase,
  ListAdminGroupMembersUseCase,
  ListAdminGroupsUseCase,
  RotateAdminGroupInviteUseCase,
} from './admin-group-list.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const WebConfig = { web: { publicBaseUrl: 'https://chantam.vn/' } };

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

describe('Admin quản trị nhóm (SRS 3.7A)', () => {
  const GroupId = '20000000-0000-4000-8000-000000000002';
  const group = { groupId: GroupId, status: 'ACTIVE', memberCount: 4 };

  function adminDeps(
    granted: string[],
    options: { found?: boolean; dissolved?: boolean } = {},
  ) {
    return {
      permissions: {
        hasPermission: jest.fn(async (_id: string, code: string) =>
          granted.includes(code),
        ),
        appendAudit: jest.fn(async () => undefined),
      },
      groups: {
        findAdminDetail: jest.fn(async () =>
          options.found === false ? null : group,
        ),
        dissolveById: jest.fn(async () => options.dissolved ?? true),
        listMembers: jest.fn(async () => ({ items: [], total: 4 })),
      },
    };
  }

  it('chi tiết: không tồn tại thì 404', async () => {
    const deps = adminDeps(['config.read'], { found: false });
    await expect(
      new GetAdminGroupUseCase(
        deps.permissions as never,
        deps.groups as never,
        WebConfig as never,
      ).handle({ actorUserId: ActorId, groupId: GroupId }),
    ).rejects.toThrow(GroupNotFoundException);
  });

  it('thành viên: cùng quyền đọc với danh sách nhóm, có phân trang', async () => {
    const deps = adminDeps(['notification.manage']);
    const result = await new ListAdminGroupMembersUseCase(
      deps.permissions as never,
      deps.groups as never,
    ).handle({ actorUserId: ActorId, groupId: GroupId, page: 2, pageSize: 2 });

    expect(deps.groups.listMembers).toHaveBeenCalledWith({
      groupId: GroupId,
      skip: 2,
      take: 2,
    });
    expect(result.meta).toMatchObject({ page: 2, total: 4 });
  });

  it('giải tán đòi admin.manage — quyền đọc nhóm KHÔNG đủ', async () => {
    const deps = adminDeps(['config.read', 'notification.manage']);
    await expect(
      new DissolveAdminGroupUseCase(
        deps.permissions as never,
        deps.groups as never,
        WebConfig as never,
      ).handle({ actorUserId: ActorId, groupId: GroupId, reason: 'Vi phạm' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.groups.dissolveById).not.toHaveBeenCalled();
  });

  it('giải tán ghi audit kèm lý do và trạng thái trước', async () => {
    const deps = adminDeps(['admin.manage']);
    await new DissolveAdminGroupUseCase(
      deps.permissions as never,
      deps.groups as never,
      WebConfig as never,
    ).handle({
      actorUserId: ActorId,
      groupId: GroupId,
      reason: '  Gian lận affiliate  ',
    });

    expect(deps.groups.dissolveById).toHaveBeenCalledWith(GroupId);
    expect(deps.permissions.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISSOLVE_GROUP',
        resourceId: GroupId,
        before: { status: 'ACTIVE', memberCount: 4 },
        reason: 'Gian lận affiliate',
      }),
    );
  });

  it('nhóm đã giải tán thì 409 và KHÔNG ghi audit', async () => {
    const deps = adminDeps(['admin.manage'], { dissolved: false });
    await expect(
      new DissolveAdminGroupUseCase(
        deps.permissions as never,
        deps.groups as never,
        WebConfig as never,
      ).handle({ actorUserId: ActorId, groupId: GroupId, reason: 'Lần hai' }),
    ).rejects.toThrow(GroupAlreadyDissolvedException);
    expect(deps.permissions.appendAudit).not.toHaveBeenCalled();
  });
});

describe('RotateAdminGroupInviteUseCase (SRS 3.7A, phương án C)', () => {
  const GroupId = '20000000-0000-4000-8000-000000000002';

  function rotateDeps(granted: string[], rotated = true) {
    const details = [
      { groupId: GroupId, inviteCode: 'OLDCODE234567890' },
      { groupId: GroupId, inviteCode: 'NEWCODE234567890' },
    ];
    return {
      permissions: {
        hasPermission: jest.fn(async (_id: string, code: string) =>
          granted.includes(code),
        ),
        appendAudit: jest.fn(async () => undefined),
      },
      groups: {
        findAdminDetail: jest.fn(async () => details.shift() ?? null),
        rotateInviteCode: jest.fn(async () => rotated),
      },
    };
  }

  it('chỉ admin.manage — Owner hay quyền đọc nhóm KHÔNG đổi được mã', async () => {
    const deps = rotateDeps(['config.read']);
    await expect(
      new RotateAdminGroupInviteUseCase(
        deps.permissions as never,
        deps.groups as never,
        WebConfig as never,
      ).handle({ actorUserId: ActorId, groupId: GroupId, reason: 'Lộ link' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.groups.rotateInviteCode).not.toHaveBeenCalled();
  });

  it('sinh mã mới 16 ký tự và ghi audit cả mã cũ lẫn mã mới', async () => {
    const deps = rotateDeps(['admin.manage']);
    const result = await new RotateAdminGroupInviteUseCase(
      deps.permissions as never,
      deps.groups as never,
      WebConfig as never,
    ).handle({ actorUserId: ActorId, groupId: GroupId, reason: ' Lộ link ' });

    const [[call]] = deps.groups.rotateInviteCode.mock.calls as unknown as [
      [{ inviteCode: string }],
    ];
    expect(call.inviteCode).toMatch(/^[A-Z0-9]{16}$/);
    expect(deps.permissions.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ROTATE_GROUP_INVITE',
        before: { inviteCode: 'OLDCODE234567890' },
        after: { inviteCode: 'NEWCODE234567890' },
        reason: 'Lộ link',
      }),
    );
    expect(result.group.inviteCode).toBe('NEWCODE234567890');
    // CMS hiện link để Admin gửi lại cho Owner — phải là link của mã MỚI.
    expect(result.group.invitePath).toBe('/invite/NEWCODE234567890');
    expect(result.group.inviteUrl).toBe(
      'https://chantam.vn/invite/NEWCODE234567890',
    );
  });

  it('nhóm không còn ACTIVE thì 409, không audit', async () => {
    const deps = rotateDeps(['admin.manage'], false);
    await expect(
      new RotateAdminGroupInviteUseCase(
        deps.permissions as never,
        deps.groups as never,
        WebConfig as never,
      ).handle({ actorUserId: ActorId, groupId: GroupId, reason: 'Lộ link' }),
    ).rejects.toThrow(GroupAlreadyDissolvedException);
    expect(deps.permissions.appendAudit).not.toHaveBeenCalled();
  });
});
