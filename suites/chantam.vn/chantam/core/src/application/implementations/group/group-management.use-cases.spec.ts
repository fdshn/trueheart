import { GroupNotFoundException } from '@/domain/exceptions';
import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  AssignGroupMemberUseCase,
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
}) {
  return {
    hasGroupPermission: jest.fn(async (params: { permission: string }) =>
      options.grants.includes(params.permission),
    ),
    findMembership: jest.fn(async () => options.membership ?? null),
    listMembers: jest.fn(async () => ({ items: [], total: 0 })),
    listSubTeams: jest.fn(async () => []),
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
