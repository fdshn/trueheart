import { GroupNotFoundException } from '@/domain/exceptions';
import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  AssignGroupMemberUseCase,
  DeleteSubTeamUseCase,
  GetGroupOverviewUseCase,
  ListGroupActivitiesUseCase,
  ListGroupMembersUseCase,
  ListSubTeamsUseCase,
} from './group-management.use-cases';

const GroupId = '20000000-0000-4000-8000-000000000001';
const CallerId = '10000000-0000-4000-8000-000000000001';
const MemberId = '10000000-0000-4000-8000-000000000002';
const SubTeamId = '30000000-0000-4000-8000-000000000001';

/**
 * Repository giả với bộ quyền truyền vào.
 *
 * `grants` là danh sách quyền mà người gọi CÓ trên nhóm đó — đúng hình mà
 * `group_role_permissions` cho ra sau khi JOIN membership.
 */
function makeGroups(options: {
  grants: string[];
  membership?: { role: GroupMemberRoles; subTeamId: string | null } | null;
  assignResult?: boolean;
  deleteResult?: boolean;
  overview?: unknown;
}) {
  return {
    deleteSubTeam: jest.fn(async () => options.deleteResult ?? true),
    hasGroupPermission: jest.fn(async (params: { permission: string }) =>
      options.grants.includes(params.permission),
    ),
    findMembership: jest.fn(async () => options.membership ?? null),
    listMembers: jest.fn(async () => ({ items: [], total: 0 })),
    listSubTeams: jest.fn(async () => []),
    listActivities: jest.fn(async () => ({ items: [], total: 0 })),
    findOverview: jest.fn(async () => options.overview ?? null),
    assignMember: jest.fn(async () => options.assignResult ?? true),
  };
}

describe('ListGroupMembersUseCase — phạm vi theo quyền', () => {
  const run = (groups: ReturnType<typeof makeGroups>) =>
    new ListGroupMembersUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
    });

  it('có group.member.view thì thấy CẢ nhóm', async () => {
    const groups = makeGroups({ grants: ['group.member.view'] });
    await run(groups);

    // `subTeamId: null` nghĩa là không lọc.
    expect(groups.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GroupId, subTeamId: null }),
    );
  });

  it('trưởng tổ chỉ thấy tổ của CHÍNH mình', async () => {
    // Đây là thứ khiến vai SUBTEAM_ADMIN có tác dụng. Trước 30/09 cả hai quyền
    // của vai này không ai đọc, nên phong vai cho ai cũng không đổi một thứ gì.
    const groups = makeGroups({
      grants: ['group.subteam.member.view'],
      membership: {
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        subTeamId: SubTeamId,
      },
    });
    await run(groups);

    expect(groups.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: SubTeamId }),
    );
  });

  it('trưởng tổ CHƯA có tổ thì bị từ chối, KHÔNG phải xem cả nhóm', async () => {
    // Nhánh leo thang quyền: trả `null` ở đây là biến một trường bỏ trống thành
    // quyền xem toàn nhóm.
    const groups = makeGroups({
      grants: ['group.subteam.member.view'],
      membership: { role: GroupMemberRoles.SUBTEAM_ADMIN, subTeamId: null },
    });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
    expect(groups.listMembers).not.toHaveBeenCalled();
  });

  it('không quyền nào thì 403', async () => {
    const groups = makeGroups({ grants: [] });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
    expect(groups.listMembers).not.toHaveBeenCalled();
  });

  it('Owner ĐANG ở trong một tổ vẫn thấy cả nhóm', async () => {
    // Thứ tự kiểm quan trọng: xét quyền tổ trước thì Owner được xếp vào một tổ
    // sẽ tự thu hẹp tầm nhìn của chính mình.
    const groups = makeGroups({
      grants: ['group.member.view', 'group.subteam.member.view'],
      membership: { role: GroupMemberRoles.OWNER, subTeamId: SubTeamId },
    });
    await run(groups);

    expect(groups.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: null }),
    );
  });
});

describe('ListSubTeamsUseCase', () => {
  it('trưởng tổ chỉ thấy tổ mình trong danh sách tổ', async () => {
    const groups = makeGroups({
      grants: ['group.subteam.member.view'],
      membership: {
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        subTeamId: SubTeamId,
      },
    });
    await new ListSubTeamsUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
    });

    expect(groups.listSubTeams).toHaveBeenCalledWith({
      groupId: GroupId,
      subTeamId: SubTeamId,
    });
  });
});

describe('AssignGroupMemberUseCase — giữ tổ khác gỡ tổ', () => {
  const run = (
    groups: ReturnType<typeof makeGroups>,
    membership: { subTeamId?: string | null; role?: GroupMemberRoles },
  ) =>
    new AssignGroupMemberUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
      memberId: MemberId,
      ...membership,
    });

  const allowed = () => makeGroups({ grants: ['group.member.assign_role'] });

  it('chỉ đổi vai thì GIỮ tổ hiện tại', async () => {
    // Bẫy cũ: controller đổi "không gửi" thành `null`, và câu UPDATE ghi
    // `sub_team_id` vô điều kiện — nên phong trưởng tổ cho ai thì gỡ họ khỏi
    // đúng cái tổ họ sắp quản.
    const groups = allowed();
    await run(groups, { role: GroupMemberRoles.SUBTEAM_ADMIN });

    expect(groups.assignMember).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: undefined }),
    );
  });

  it('gửi null tường minh thì GỠ khỏi tổ', async () => {
    const groups = allowed();
    await run(groups, { subTeamId: null });

    expect(groups.assignMember).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: null }),
    );
  });

  it('không gửi trường nào thì là lượt gọi sai, không phải 200', async () => {
    const groups = allowed();

    await expect(run(groups, {})).rejects.toThrow(ValidationFailedException);
    expect(groups.assignMember).not.toHaveBeenCalled();
  });

  it('không gán được vai OWNER', async () => {
    const groups = allowed();

    await expect(run(groups, { role: GroupMemberRoles.OWNER })).rejects.toThrow(
      ValidationFailedException,
    );
    expect(groups.assignMember).not.toHaveBeenCalled();
  });

  it('không khớp dòng nào thì 404, không nói rõ vì sao', async () => {
    // Ba ca — không thuộc nhóm, là Owner, tổ thuộc nhóm khác — cùng một câu trả
    // lời. Phân biệt là để lộ cấu trúc nhóm người khác cho người vừa đoán id.
    const groups = makeGroups({
      grants: ['group.member.assign_role'],
      assignResult: false,
    });

    await expect(run(groups, { subTeamId: SubTeamId })).rejects.toThrow(
      GroupNotFoundException,
    );
  });

  it('thiếu quyền thì 403 trước mọi phép kiểm khác', async () => {
    const groups = makeGroups({ grants: [] });

    await expect(run(groups, {})).rejects.toThrow(ForbiddenException);
  });
});

describe('DeleteSubTeamUseCase', () => {
  const run = (groups: ReturnType<typeof makeGroups>) =>
    new DeleteSubTeamUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
      subTeamId: SubTeamId,
    });

  it('đòi group.subteam.manage — cùng quyền với TẠO tổ', async () => {
    const groups = makeGroups({ grants: ['group.subteam.manage'] });
    await run(groups);

    expect(groups.deleteSubTeam).toHaveBeenCalledWith({
      groupId: GroupId,
      subTeamId: SubTeamId,
    });
  });

  it('trưởng tổ KHÔNG xoá được tổ của chính mình', async () => {
    // Họ không tạo ra tổ, và cho họ xoá là cho họ tự gỡ mọi người khỏi tổ mà
    // Owner vừa xếp vào.
    const groups = makeGroups({
      grants: ['group.subteam.member.view', 'group.subteam.activity.view'],
      membership: {
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        subTeamId: SubTeamId,
      },
    });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
    expect(groups.deleteSubTeam).not.toHaveBeenCalled();
  });

  it('tổ không tồn tại hoặc thuộc nhóm khác thì 404, không nói rõ ca nào', async () => {
    const groups = makeGroups({
      grants: ['group.subteam.manage'],
      deleteResult: false,
    });

    await expect(run(groups)).rejects.toThrow(GroupNotFoundException);
  });

  it('trả danh sách tổ CÒN LẠI sau khi xoá', async () => {
    const groups = makeGroups({ grants: ['group.subteam.manage'] });
    await run(groups);

    expect(groups.listSubTeams).toHaveBeenCalledWith({ groupId: GroupId });
  });
});

describe('GetGroupOverviewUseCase', () => {
  const run = (groups: ReturnType<typeof makeGroups>) =>
    new GetGroupOverviewUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
    });

  it('đòi group.overview.view — quyền duy nhất của vai MEMBER', async () => {
    // Tới 30/09 không dòng code nào kiểm quyền này, nên gán vai MEMBER không đổi
    // một thứ gì. Đây là endpoint làm nó có tác dụng.
    const groups = makeGroups({ grants: [] });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
    expect(groups.findOverview).not.toHaveBeenCalled();
  });

  it('nhóm không tồn tại và không thuộc nhóm cùng một câu trả lời', async () => {
    // Phân biệt là cho người lạ dò xem id nào là một nhóm thật.
    const groups = makeGroups({ grants: ['group.overview.view'] });

    await expect(run(groups)).rejects.toThrow(GroupNotFoundException);
  });

  it('trả tổng quan khi đủ quyền', async () => {
    const groups = makeGroups({
      grants: ['group.overview.view'],
      overview: { groupId: GroupId, name: 'Nhóm thử' },
    });

    await expect(run(groups)).resolves.toEqual({
      group: { groupId: GroupId, name: 'Nhóm thử' },
    });
    expect(groups.findOverview).toHaveBeenCalledWith({
      groupId: GroupId,
      viewerId: CallerId,
    });
  });
});

describe('ListGroupActivitiesUseCase — phạm vi riêng khỏi xem thành viên', () => {
  const run = (groups: ReturnType<typeof makeGroups>) =>
    new ListGroupActivitiesUseCase(groups as never).handle({
      userId: CallerId,
      groupId: GroupId,
    });

  it('có group.activity.view thì thấy CẢ nhóm', async () => {
    const groups = makeGroups({ grants: ['group.activity.view'] });
    const result = await run(groups);

    expect(groups.listActivities).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: null }),
    );
    expect(result.scopedToSubTeamId).toBeNull();
  });

  it('trưởng tổ chỉ thấy hoạt động của tổ mình', async () => {
    const groups = makeGroups({
      grants: ['group.subteam.activity.view'],
      membership: {
        role: GroupMemberRoles.SUBTEAM_ADMIN,
        subTeamId: SubTeamId,
      },
    });
    const result = await run(groups);

    expect(groups.listActivities).toHaveBeenCalledWith(
      expect.objectContaining({ subTeamId: SubTeamId }),
    );
    // Trả ra phạm vi để client không tưởng danh sách ngắn là nhóm ít hoạt động.
    expect(result.scopedToSubTeamId).toBe(SubTeamId);
  });

  it('quyền xem THÀNH VIÊN không mở được hoạt động', async () => {
    // Hai cặp quyền là hai quyết định độc lập. Gộp lại thì sửa phạm vi xem thành
    // viên sẽ âm thầm đổi cả phạm vi xem hoạt động.
    const groups = makeGroups({
      grants: ['group.member.view', 'group.subteam.member.view'],
      membership: { role: GroupMemberRoles.OWNER, subTeamId: null },
    });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
  });

  it('trưởng tổ chưa có tổ thì bị từ chối, KHÔNG phải xem cả nhóm', async () => {
    const groups = makeGroups({
      grants: ['group.subteam.activity.view'],
      membership: { role: GroupMemberRoles.SUBTEAM_ADMIN, subTeamId: null },
    });

    await expect(run(groups)).rejects.toThrow(ForbiddenException);
    expect(groups.listActivities).not.toHaveBeenCalled();
  });
});
