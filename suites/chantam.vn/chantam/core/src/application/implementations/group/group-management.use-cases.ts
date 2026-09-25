import {
  IAssignGroupMemberCommand,
  IAssignGroupMemberResult,
  IAssignGroupMemberUseCase,
  ICreateSubTeamCommand,
  ICreateSubTeamUseCase,
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

@Injectable()
export class ListGroupMembersUseCase implements IListGroupMembersUseCase {
  public constructor(
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListGroupMembersCommand,
  ): Promise<IListGroupMembersResult> {
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.member.view',
    });

    const take = Math.min(MaxPageSize, command.limit ?? DefaultPageSize);
    const skip = Math.max(0, ((command.page ?? 1) - 1) * take);
    const { items, total } = await this.groups.listMembers({
      groupId: command.groupId,
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
    // sách thành viên chưa nói.
    await assertGroupPermission(this.groups, {
      userId: command.userId,
      groupId: command.groupId,
      permission: 'group.member.view',
    });

    return { subTeams: await this.groups.listSubTeams(command.groupId) };
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

    return { subTeams: await this.groups.listSubTeams(command.groupId) };
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
