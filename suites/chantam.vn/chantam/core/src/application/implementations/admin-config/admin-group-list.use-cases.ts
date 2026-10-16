import {
  IDissolveAdminGroupCommand,
  IDissolveAdminGroupUseCase,
  IGetAdminGroupCommand,
  IGetAdminGroupUseCase,
  IListAdminGroupMembersCommand,
  IListAdminGroupMembersResult,
  IListAdminGroupMembersUseCase,
  IListAdminGroupsCommand,
  IListAdminGroupsResult,
  IListAdminGroupsUseCase,
  IRotateAdminGroupInviteCommand,
  IRotateAdminGroupInviteUseCase,
} from '@/application/contracts/admin-config';
import {
  GroupAlreadyDissolvedException,
  GroupNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IAdminGroupDetail,
  IGroupRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { makeInviteCode } from '../group/group.use-cases';

/**
 * Hai màn CMS cần chọn nhóm: gửi thông báo hàng loạt (`notification.manage`) và
 * lọc sự kiện affiliate (`config.read`). Có MỘT trong hai là đủ — thêm mã riêng
 * là seed một dòng `admin_permissions` chưa chắc vai nào được gán.
 */
const PickerPermissions = ['notification.manage', 'config.read'] as const;

/**
 * Giải tán nhóm và đổi mã mời là can thiệp lên cả một cộng đồng — không phải việc
 * của người chỉ được đọc cấu hình hay gửi thông báo.
 */
const DissolvePermission = 'admin.manage';

async function assertCanReadGroups(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  for (const code of PickerPermissions)
    if (await permissions.hasPermission(actorUserId, code)) return;
  throw new ForbiddenException();
}

async function requireGroup(
  groups: IGroupRepository,
  groupId: string,
): Promise<IAdminGroupDetail> {
  const group = await groups.findAdminDetail(groupId);
  if (!group) throw new GroupNotFoundException();
  return group;
}

/** Danh sách nhóm cho CMS chọn nhóm (CMS A5). */
@Injectable()
export class ListAdminGroupsUseCase implements IListAdminGroupsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListAdminGroupsCommand,
  ): Promise<IListAdminGroupsResult> {
    await assertCanReadGroups(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.groups.listForAdmin({
      // Chuỗi trắng là "không lọc", không phải "khớp mọi tên có dấu cách".
      keyword: command.keyword?.trim() || null,
      status: command.status ?? null,
      skip,
      take,
    });

    return {
      groups: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/** Một nhóm cho CMS, mọi trạng thái (SRS 3.7A). */
@Injectable()
export class GetAdminGroupUseCase implements IGetAdminGroupUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IGetAdminGroupCommand,
  ): Promise<{ group: IAdminGroupDetail }> {
    await assertCanReadGroups(this.permissions, command.actorUserId);
    return { group: await requireGroup(this.groups, command.groupId) };
  }
}

/** Thành viên ĐANG hiệu lực của một nhóm, cho CMS. */
@Injectable()
export class ListAdminGroupMembersUseCase implements IListAdminGroupMembersUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListAdminGroupMembersCommand,
  ): Promise<IListAdminGroupMembersResult> {
    await assertCanReadGroups(this.permissions, command.actorUserId);
    await requireGroup(this.groups, command.groupId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.groups.listMembers({
      groupId: command.groupId,
      skip,
      take,
    });
    return {
      members: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

/**
 * Admin giải tán một nhóm (SRS 3.7A) — cùng hiệu ứng với Owner xoá tài khoản: link
 * mời chết, không nhận thành viên hay sự kiện affiliate mới, membership/sổ điểm/audit
 * GIỮ NGUYÊN, không chuyển Owner cho ai. Không đảo ngược được qua API.
 */
@Injectable()
export class DissolveAdminGroupUseCase implements IDissolveAdminGroupUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IDissolveAdminGroupCommand,
  ): Promise<{ group: IAdminGroupDetail }> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        DissolvePermission,
      ))
    )
      throw new ForbiddenException();

    const before = await requireGroup(this.groups, command.groupId);
    // `dissolveById` chỉ khớp dòng ACTIVE trong chính câu UPDATE — hai Admin bấm cùng
    // lúc thì người sau nhận 409, không ghi đè mốc giải tán của người trước.
    if (!(await this.groups.dissolveById(command.groupId)))
      throw new GroupAlreadyDissolvedException();

    await this.permissions.appendAudit({
      actorUserId: command.actorUserId,
      action: 'DISSOLVE_GROUP',
      resourceType: 'GROUP',
      resourceId: command.groupId,
      before: { status: before.status, memberCount: before.memberCount },
      after: { status: 'DISSOLVED' },
      reason: command.reason.trim(),
    });

    return { group: await requireGroup(this.groups, command.groupId) };
  }
}

/**
 * Admin đổi mã mời khi link bị lộ hoặc bị spam (SRS 3.7A, phương án C).
 *
 * Owner và thành viên KHÔNG đổi được (Phase 1 không cho xoay link). Mã cũ chết ngay;
 * người đã vào nhóm bằng mã cũ không bị ảnh hưởng. Mã mới sinh cùng bộ sinh với lúc
 * tạo nhóm — ngẫu nhiên mật mã, 16 ký tự.
 */
@Injectable()
export class RotateAdminGroupInviteUseCase implements IRotateAdminGroupInviteUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IRotateAdminGroupInviteCommand,
  ): Promise<{ group: IAdminGroupDetail }> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        DissolvePermission,
      ))
    )
      throw new ForbiddenException();

    const before = await requireGroup(this.groups, command.groupId);
    const rotated = await this.groups.rotateInviteCode({
      groupId: command.groupId,
      inviteCode: makeInviteCode(),
    });
    if (!rotated) throw new GroupAlreadyDissolvedException();

    const after = await requireGroup(this.groups, command.groupId);
    // Ghi CẢ hai mã: "link cũ tôi gửi đi là mã nào" là câu hỏi đầu tiên khi có người
    // báo link không vào được.
    await this.permissions.appendAudit({
      actorUserId: command.actorUserId,
      action: 'ROTATE_GROUP_INVITE',
      resourceType: 'GROUP',
      resourceId: command.groupId,
      before: { inviteCode: before.inviteCode },
      after: { inviteCode: after.inviteCode },
      reason: command.reason.trim(),
    });

    return { group: after };
  }
}
