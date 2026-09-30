import {
  IAssignGroupMemberCommand,
  IAssignGroupMemberResult,
  IAssignGroupMemberUseCase,
  ICreateSubTeamCommand,
  ICreateSubTeamUseCase,
  IDeleteSubTeamCommand,
  IDeleteSubTeamUseCase,
  IGetGroupOverviewCommand,
  IGetGroupOverviewResult,
  IGetGroupOverviewUseCase,
  IListGroupActivitiesCommand,
  IListGroupActivitiesResult,
  IListGroupActivitiesUseCase,
  IListGroupMembersCommand,
  IListGroupMembersResult,
  IListGroupMembersUseCase,
  IListSubTeamsCommand,
  IListSubTeamsResult,
  IListSubTeamsUseCase,
} from '@/application/contracts/group';
import { GroupNotFoundException } from '@/domain/exceptions';
import { IGroupRepository } from '@/domain/ports/repository';
import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const DefaultPageSize = 50;
const MaxPageSize = 100;

/**
 * Kiểm quyền trên MỘT nhóm cụ thể.
 *
 * Gom một chỗ vì bốn use case dưới đây đều bắt đầu bằng đúng câu này, và bốn chỗ
 * tự kiểm là bốn chỗ có thể quên `groupId` — mà thiếu nó thì trưởng nhóm này
 * thành trưởng mọi nhóm.
 */
async function assertGroupPermission(
  groups: IGroupRepository,
  params: { userId: string; groupId: string; permission: string },
): Promise<void> {
  if (!(await groups.hasGroupPermission(params)))
    throw new ForbiddenException();
}

/**
 * Phạm vi danh sách thành viên mà người gọi được xem.
 *
 * `null` = cả nhóm. Một `subTeamId` = chỉ tổ đó.
 *
 * Hai quyền, hai phạm vi — và trước 30/09 chỉ quyền đầu được đọc, nên
 * `group.subteam.member.view` là một dòng seed không ai dùng và vai
 * `SUBTEAM_ADMIN` hoàn toàn vô tác dụng: phong cho ai cũng không đổi một thứ gì.
 *
 * Thứ tự kiểm quan trọng: quyền toàn nhóm xét TRƯỚC, vì Owner cũng có thể được
 * xếp vào một tổ, và xét ngược thì Owner ở trong tổ sẽ chỉ còn thấy tổ mình.
 */
async function resolveMemberScope(
  groups: IGroupRepository,
  params: { userId: string; groupId: string },
): Promise<string | null> {
  if (
    await groups.hasGroupPermission({
      ...params,
      permission: 'group.member.view',
    })
  )
    return null;

  if (
    !(await groups.hasGroupPermission({
      ...params,
      permission: 'group.subteam.member.view',
    }))
  )
    throw new ForbiddenException();

  const membership = await groups.findMembership(params);

  // Trưởng tổ chưa được xếp vào tổ nào thì KHÔNG có tổ để xem. Trả `null` ở đây
  // là biến "chưa có tổ" thành "xem được cả nhóm" — leo thang quyền bằng một
  // trường bỏ trống.
  if (!membership?.subTeamId) throw new ForbiddenException();

  return membership.subTeamId;
}

/**
 * Phạm vi dòng hoạt động — cùng hình với `resolveMemberScope`, khác cặp quyền.
 *
 * Tách hai hàm chứ không thêm tham số: hai cặp quyền là hai quyết định độc lập
 * của Bên A, và gộp lại thì sửa phạm vi xem thành viên sẽ âm thầm đổi cả phạm vi
 * xem hoạt động.
 */
async function resolveActivityScope(
  groups: IGroupRepository,
  params: { userId: string; groupId: string },
): Promise<string | null> {
  if (
    await groups.hasGroupPermission({
      ...params,
      permission: 'group.activity.view',
    })
  )
    return null;

  if (
    !(await groups.hasGroupPermission({
      ...params,
      permission: 'group.subteam.activity.view',
    }))
  )
    throw new ForbiddenException();

  const membership = await groups.findMembership(params);

  // Trưởng tổ chưa có tổ thì KHÔNG có hoạt động nào để xem. Trả `null` ở đây là
  // biến "chưa có tổ" thành "xem được cả nhóm".
  if (!membership?.subTeamId) throw new ForbiddenException();

  return membership.subTeamId;
}

@Injectable()
export class ListGroupMembersUseCase implements IListGroupMembersUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListGroupMembersCommand,
  ): Promise<IListGroupMembersResult> {
    const subTeamId = await resolveMemberScope(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
    });

    const take = Math.min(MaxPageSize, command.limit ?? DefaultPageSize);
    const skip = Math.max(0, ((command.page ?? 1) - 1) * take);
    const { items, total } = await this.groups.listMembers({
      groupId: command.groupId,
      subTeamId,
      skip,
      take,
    });

    return { members: items, total };
  }
}

@Injectable()
export class ListSubTeamsUseCase implements IListSubTeamsUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListSubTeamsCommand,
  ): Promise<IListSubTeamsResult> {
    // Xem tổ đi cùng quyền xem thành viên: danh sách tổ không nói gì mà danh
    // sách thành viên chưa nói. Trưởng tổ cũng vào được — họ cần biết tên tổ
    // mình, và `resolveMemberScope` đã đòi họ thật sự thuộc một tổ.
    const subTeamId = await resolveMemberScope(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
    });

    return {
      subTeams: await this.groups.listSubTeams({
        groupId: command.groupId,
        subTeamId,
      }),
    };
  }
}

@Injectable()
export class CreateSubTeamUseCase implements ICreateSubTeamUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: ICreateSubTeamCommand,
  ): Promise<IListSubTeamsResult> {
    // `group.subteam.manage` chỉ Owner có (BR-GRP-05): trưởng nhóm con KHÔNG tạo
    // được tổ, kể cả tổ của chính mình.
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.subteam.manage',
    });

    const name = command.name.trim();
    if (!name)
      throw new ValidationFailedException(['name không được để trống']);

    await this.groups.createSubTeam({
      globalId: randomUUID(),
      groupId: command.groupId,
      name,
    });

    return {
      subTeams: await this.groups.listSubTeams({ groupId: command.groupId }),
    };
  }
}

@Injectable()
export class GetGroupOverviewUseCase implements IGetGroupOverviewUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IGetGroupOverviewCommand,
  ): Promise<IGetGroupOverviewResult> {
    // `group.overview.view` — quyền DUY NHẤT của vai MEMBER, và tới 30/09 không
    // dòng code nào kiểm nó. Đây là endpoint làm nó có tác dụng.
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.overview.view',
    });

    const group = await this.groups.findOverview({
      groupId: command.groupId,
      viewerId: command.userId,
    });
    // Không tồn tại và không thuộc nhóm cùng một câu trả lời. Phân biệt là cho
    // người lạ dò xem id nào là một nhóm thật.
    if (!group) throw new GroupNotFoundException();

    return { group };
  }
}

@Injectable()
export class ListGroupActivitiesUseCase implements IListGroupActivitiesUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListGroupActivitiesCommand,
  ): Promise<IListGroupActivitiesResult> {
    const subTeamId = await resolveActivityScope(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
    });

    const take = Math.min(MaxPageSize, command.limit ?? DefaultPageSize);
    const skip = Math.max(0, ((command.page ?? 1) - 1) * take);
    const { items, total } = await this.groups.listActivities({
      groupId: command.groupId,
      subTeamId,
      skip,
      take,
    });

    return { activities: items, total, scopedToSubTeamId: subTeamId };
  }
}

@Injectable()
export class DeleteSubTeamUseCase implements IDeleteSubTeamUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IDeleteSubTeamCommand,
  ): Promise<IListSubTeamsResult> {
    // Cùng quyền với TẠO tổ: ai lập được tổ thì dẹp được tổ. Trưởng tổ không xoá
    // được tổ của chính mình — họ không tạo ra nó, và cho họ xoá là cho họ tự gỡ
    // mọi người khỏi tổ mà Owner vừa xếp vào.
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.subteam.manage',
    });

    const removed = await this.groups.deleteSubTeam({
      groupId: command.groupId,
      subTeamId: command.subTeamId,
    });
    // Không tồn tại, thuộc nhóm khác, hoặc đã xoá — cùng một câu trả lời. Phân
    // biệt là để lộ cấu trúc nhóm người khác cho người vừa đoán một id, đúng lối
    // `assignMember` đã chọn.
    if (!removed) throw new GroupNotFoundException();

    return {
      subTeams: await this.groups.listSubTeams({ groupId: command.groupId }),
    };
  }
}

@Injectable()
export class AssignGroupMemberUseCase implements IAssignGroupMemberUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IAssignGroupMemberCommand,
  ): Promise<IAssignGroupMemberResult> {
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.member.assign_role',
    });

    // Một PATCH không nói gì thì không phải "thành công", nó là một lượt gọi
    // sai. Cho qua thì client gửi thiếu trường vẫn nhận 200 và tin là đã đổi.
    if (command.subTeamId === undefined && command.role === undefined)
      throw new ValidationFailedException([
        'cần ít nhất một trong hai: subTeamId (null để gỡ khỏi tổ) hoặc role',
      ]);

    // OWNER không gán được cho ai. Hai Owner trên một nhóm thì `groups.owner_id`
    // và bảng membership nói hai chuyện khác nhau, và không có quy tắc nào phân
    // xử. Repository cũng từ chối HẠ vai Owner hiện tại.
    if (command.role === GroupMemberRoles.OWNER)
      throw new ValidationFailedException([
        'role: không gán được vai OWNER — chủ nhóm là người tạo nhóm',
      ]);

    const changed = await this.groups.assignMember({
      groupId: command.groupId,
      userId: command.memberId,
      // Truyền THẲNG, không `?? null`: chính phép `?? null` ở controller là thứ
      // đã biến "không gửi" thành "gỡ khỏi tổ".
      subTeamId: command.subTeamId,
      role: command.role ?? null,
    });
    // Không khớp gì: người đó không thuộc nhóm, là Owner, hoặc tổ thuộc nhóm
    // khác. Ba ca cùng một câu trả lời — phân biệt là để lộ cấu trúc nhóm người
    // khác cho người vừa đoán một id.
    if (!changed) throw new GroupNotFoundException();

    const { items, total } = await this.groups.listMembers({
      groupId: command.groupId,
      skip: 0,
      take: DefaultPageSize,
    });

    return { members: items, total };
  }
}
