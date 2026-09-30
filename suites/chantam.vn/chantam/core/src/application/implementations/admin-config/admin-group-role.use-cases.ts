import {
  EnforcedGroupPermissions,
  IGetGroupRolePermissionsCommand,
  IGetGroupRolePermissionsResult,
  IGetGroupRolePermissionsUseCase,
  IReplaceGroupRolePermissionsCommand,
  IReplaceGroupRolePermissionsResult,
  IReplaceGroupRolePermissionsUseCase,
  KnownGroupPermissions,
} from '@/application/contracts/admin-config';
import {
  IAdminConfigRepository,
  IGroupRepository,
} from '@/domain/ports/repository';
import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Đường Admin cho `group_role_permissions` — bổ sung 30/09.
 *
 * `18-group.md` §18.4 từng nói bảng này là "cấu hình Admin hệ thống, có audit và
 * đánh phiên bản". Không có thứ nào đúng: đổi quyền phải chạy SQL tay, bảng không
 * có cột `version`, `updated_by` chưa bao giờ được ghi.
 *
 * ## Vì sao dùng `config.read`/`config.write` chứ không thêm mã quyền mới
 *
 * Đây là một bảng CẤU HÌNH, và `POLICY_ADMIN` cùng `SUPER_ADMIN` đã giữ hai mã
 * đó. Thêm một mã riêng nghĩa là seed thêm một dòng `admin_permissions` mà chưa
 * chắc vai nào được gán — tức tự tạo đúng loại "quyền seed mà không ai có" mà
 * lượt soát này vừa đi dọn.
 *
 * Bên A muốn tách nhiệm vụ thì thêm mã riêng lúc đó, kèm việc gán cho vai nào.
 */
const ReadPermission = 'config.read';
const WritePermission = 'config.write';

/** Hai vai Admin cấu hình được. `OWNER` không nằm đây — xem `assertRole`. */
const ConfigurableRoles: readonly GroupMemberRoles[] = [
  GroupMemberRoles.SUBTEAM_ADMIN,
  GroupMemberRoles.MEMBER,
];

function decorate(
  sets: { role: GroupMemberRoles; version: number; permissions: string[] }[],
  knownPermissions: readonly string[],
): IGetGroupRolePermissionsResult {
  return {
    roles: sets.map((set) => ({
      ...set,
      // `effective` để màn hình Admin phân biệt "quyền có tác dụng" với "quyền
      // canh một endpoint chưa tồn tại". Thiếu nó thì Admin gán quyền, không thấy
      // gì đổi, và không có cách nào biết vì sao.
      effective: set.permissions.some((permission) =>
        EnforcedGroupPermissions.includes(permission),
      ),
    })),
    knownPermissions: [...knownPermissions],
  };
}

@Injectable()
export class GetGroupRolePermissionsUseCase implements IGetGroupRolePermissionsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IGetGroupRolePermissionsCommand,
  ): Promise<IGetGroupRolePermissionsResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        ReadPermission,
      ))
    )
      throw new ForbiddenException();

    return decorate(
      await this.groups.listRolePermissions(),
      KnownGroupPermissions,
    );
  }
}

@Injectable()
export class ReplaceGroupRolePermissionsUseCase implements IReplaceGroupRolePermissionsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IReplaceGroupRolePermissionsCommand,
  ): Promise<IReplaceGroupRolePermissionsResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        WritePermission,
      ))
    )
      throw new ForbiddenException();

    const { permissions, reason } = command.rolePermissions;
    const problems: string[] = [];

    // `OWNER` KHÔNG cấu hình được. Chủ nhóm là người duy nhất quản trị được nhóm
    // mình, và thu hồi `group.member.assign_role` của họ để lại một nhóm không ai
    // xếp được người vào tổ — mà cũng không ai lấy lại được quyền đó, vì đường
    // duy nhất để lấy lại là chính endpoint này.
    if (!ConfigurableRoles.includes(command.role))
      problems.push(
        `role: ${command.role} không cấu hình được — chủ nhóm phải giữ đủ quyền quản trị nhóm mình`,
      );

    // Mã lạ bị TỪ CHỐI, không lưu im lặng. Một mã gõ nhầm lưu thành công là đúng
    // cái bệnh đã làm cả vai SUBTEAM_ADMIN vô tác dụng mà không hiện ra ở đâu.
    const unknown = permissions.filter(
      (permission) => !KnownGroupPermissions.includes(permission),
    );
    if (unknown.length > 0)
      problems.push(
        `permissions: mã không tồn tại nên sẽ không có tác dụng: ${unknown.join(', ')}`,
      );

    const duplicated = permissions.filter(
      (permission, index) => permissions.indexOf(permission) !== index,
    );
    if (duplicated.length > 0)
      problems.push(
        `permissions: trùng lặp: ${[...new Set(duplicated)].join(', ')}`,
      );

    if (problems.length > 0) throw new ValidationFailedException(problems);

    const result = await this.groups.replaceRolePermissions({
      role: command.role,
      permissions,
      actorUserId: command.actorUserId,
      changeReason: reason.trim(),
    });

    // Audit ghi CẢ trước và sau. Chỉ ghi "sau" thì đọc lại không biết Admin vừa
    // thêm hay vừa thu hồi, mà thu hồi mới là thứ cần tra.
    await this.permissions.appendAudit({
      actorUserId: command.actorUserId,
      action: 'REPLACE_GROUP_ROLE_PERMISSIONS',
      resourceType: 'GROUP_ROLE_PERMISSION',
      resourceId: command.role,
      before: { permissions: result.before },
      after: { permissions: result.permissions, version: result.version },
      reason: reason.trim(),
    });

    return decorate(
      await this.groups.listRolePermissions(),
      KnownGroupPermissions,
    );
  }
}
