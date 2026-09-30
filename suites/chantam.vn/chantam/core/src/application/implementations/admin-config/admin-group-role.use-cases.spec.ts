import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  GetGroupRolePermissionsUseCase,
  ReplaceGroupRolePermissionsUseCase,
} from './admin-group-role.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const Reason = 'Bên A chốt trưởng tổ xem hoạt động tổ mình, ngày 30/09';

function makeDeps(options: { granted: string[] }) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_userId: string, code: string) =>
        options.granted.includes(code),
      ),
      appendAudit: jest.fn(async () => undefined),
    },
    groups: {
      listRolePermissions: jest.fn(async () => [
        {
          role: GroupMemberRoles.SUBTEAM_ADMIN,
          version: 2,
          permissions: ['group.subteam.member.view'],
        },
      ]),
      replaceRolePermissions: jest.fn(async () => ({
        version: 2,
        permissions: ['group.subteam.member.view'],
        before: ['group.subteam.member.view', 'group.subteam.activity.view'],
      })),
    },
  };
}

const replace = (deps: ReturnType<typeof makeDeps>) =>
  new ReplaceGroupRolePermissionsUseCase(
    deps.permissions as never,
    deps.groups as never,
  );

describe('GetGroupRolePermissionsUseCase', () => {
  it('đòi config.read', async () => {
    const deps = makeDeps({ granted: [] });

    await expect(
      new GetGroupRolePermissionsUseCase(
        deps.permissions as never,
        deps.groups as never,
      ).handle({ actorUserId: ActorId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('trả kèm knownPermissions và cờ effective', async () => {
    // Thiếu hai thứ này thì Admin gán một quyền, không thấy gì đổi, và không có
    // cách nào biết vì sao — đúng tình trạng vai SUBTEAM_ADMIN nằm trong suốt.
    const deps = makeDeps({ granted: ['config.read'] });
    const result = await new GetGroupRolePermissionsUseCase(
      deps.permissions as never,
      deps.groups as never,
    ).handle({ actorUserId: ActorId });

    expect(result.knownPermissions).toContain('group.affiliate.view');
    expect(result.roles[0].effective).toBe(true);
  });
});

describe('ReplaceGroupRolePermissionsUseCase', () => {
  it('đòi config.write, không phải config.read', async () => {
    const deps = makeDeps({ granted: ['config.read'] });

    await expect(
      replace(deps).handle({
        actorUserId: ActorId,
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        rolePermissions: { permissions: [], reason: Reason },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('KHÔNG cấu hình được vai OWNER', async () => {
    // Thu hồi `group.member.assign_role` của chủ nhóm để lại một nhóm không ai
    // xếp được người vào tổ, mà cũng không lấy lại được — đường duy nhất để lấy
    // lại là chính endpoint này.
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      replace(deps).handle({
        actorUserId: ActorId,
        role: GroupMemberRoles.OWNER,
        rolePermissions: { permissions: [], reason: Reason },
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.groups.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it('TỪ CHỐI mã quyền không tồn tại, không lưu im lặng', async () => {
    // Một mã gõ nhầm lưu thành công là đúng cái bệnh đã làm cả vai SUBTEAM_ADMIN
    // vô tác dụng mà không hiện ra ở bất kỳ đâu.
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      replace(deps).handle({
        actorUserId: ActorId,
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        rolePermissions: {
          permissions: ['group.subteam.member.view', 'group.abc.view'],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.groups.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it('từ chối mã trùng lặp', async () => {
    const deps = makeDeps({ granted: ['config.write'] });

    await expect(
      replace(deps).handle({
        actorUserId: ActorId,
        role: GroupMemberRoles.MEMBER,
        rolePermissions: {
          permissions: ['group.overview.view', 'group.overview.view'],
          reason: Reason,
        },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('tập RỖNG là hợp lệ — thu hồi hết quyền của một vai', async () => {
    const deps = makeDeps({ granted: ['config.write'] });
    await replace(deps).handle({
      actorUserId: ActorId,
      role: GroupMemberRoles.SUBTEAM_ADMIN,
      rolePermissions: { permissions: [], reason: Reason },
    });

    expect(deps.groups.replaceRolePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [] }),
    );
  });

  it('ghi audit CẢ trước và sau', async () => {
    // Chỉ ghi "sau" thì đọc lại không biết Admin vừa thêm hay vừa thu hồi, mà
    // thu hồi mới là thứ cần tra.
    const deps = makeDeps({ granted: ['config.write'] });
    await replace(deps).handle({
      actorUserId: ActorId,
      role: GroupMemberRoles.SUBTEAM_ADMIN,
      rolePermissions: {
        permissions: ['group.subteam.member.view'],
        reason: Reason,
      },
    });

    expect(deps.permissions.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPLACE_GROUP_ROLE_PERMISSIONS',
        resourceId: GroupMemberRoles.SUBTEAM_ADMIN,
        before: {
          permissions: [
            'group.subteam.member.view',
            'group.subteam.activity.view',
          ],
        },
        after: { permissions: ['group.subteam.member.view'], version: 2 },
      }),
    );
  });
});
