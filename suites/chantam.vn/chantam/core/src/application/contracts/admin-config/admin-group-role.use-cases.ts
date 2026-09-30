import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGroupRolePermissionSet {
  readonly role: GroupMemberRoles;
  readonly version: number;
  readonly permissions: string[];
  /** `true` khi có dòng code thật sự kiểm quyền này. */
  readonly effective?: boolean;
}

export interface IGetGroupRolePermissionsCommand {
  readonly actorUserId: string;
}

export interface IGetGroupRolePermissionsResult {
  readonly roles: IGroupRolePermissionSet[];
  /**
   * Toàn bộ mã quyền mà CODE thật sự kiểm.
   *
   * Trả kèm để màn hình Admin phân biệt được "quyền đang có tác dụng" với "quyền
   * canh một endpoint chưa tồn tại". Thiếu nó thì Admin gán một quyền, không thấy
   * gì đổi, và không có cách nào biết vì sao — đúng tình trạng vai
   * `SUBTEAM_ADMIN` nằm trong suốt ba tháng.
   */
  readonly knownPermissions: string[];
}

export interface IGetGroupRolePermissionsUseCase extends IUseCase<
  IGetGroupRolePermissionsCommand,
  IGetGroupRolePermissionsResult
> {}
export const IGetGroupRolePermissionsUseCase = Symbol(
  'IGetGroupRolePermissionsUseCase',
);

export interface IReplaceGroupRolePermissionsCommand {
  readonly actorUserId: string;
  readonly role: GroupMemberRoles;
  readonly rolePermissions: {
    readonly permissions: string[];
    readonly reason: string;
  };
}

export interface IReplaceGroupRolePermissionsResult extends IGetGroupRolePermissionsResult {}

export interface IReplaceGroupRolePermissionsUseCase extends IUseCase<
  IReplaceGroupRolePermissionsCommand,
  IReplaceGroupRolePermissionsResult
> {}
export const IReplaceGroupRolePermissionsUseCase = Symbol(
  'IReplaceGroupRolePermissionsUseCase',
);

/**
 * Mã quyền nhóm mà CODE thật sự kiểm.
 *
 * Danh sách này là hợp đồng giữa Admin và code: gán một quyền ngoài đây thì không
 * gì xảy ra. Đường ghi TỪ CHỐI mã lạ thay vì lưu im lặng — một mã gõ nhầm được
 * lưu thành công là đúng cái bệnh đã làm cả vai `SUBTEAM_ADMIN` vô tác dụng, và
 * nó không hiện ra ở bất kỳ đâu.
 *
 * Quyền canh endpoint CHƯA tồn tại vẫn gán được (chúng nằm ở
 * `KnownGroupPermissions` nhưng chưa có ai kiểm) — chặn chúng là buộc Bên A phải
 * đợi code mới cấu hình được. Nhưng chúng được đánh dấu để Admin biết.
 */
export const KnownGroupPermissions: readonly string[] = [
  'group.overview.view',
  'group.member.view',
  'group.member.assign_role',
  'group.subteam.manage',
  'group.subteam.member.view',
  'group.subteam.activity.view',
  'group.invite.view',
  'group.activity.view',
  'group.affiliate.view',
  'group.settings.manage',
];

/**
 * Trong số trên, những mã có dòng code thật sự kiểm.
 *
 * **Mười trên mười** tính tới 30/09 — không còn mã nào seed mà không ai kiểm. Nếu
 * thêm mã mới, `test:config-inventory` đỏ tới khi nó được khai vào đây hoặc vào
 * danh sách nợ kèm lý do.
 *
 * Danh sách này là NGUỒN DUY NHẤT: cờ `effective` của `GET /admin/groups/
 * role-permissions` và phép kiểm "mỗi vai phải có ít nhất một quyền có tác dụng"
 * đều đọc từ đây. Hai bản sao sẽ trôi khỏi nhau, và khi trôi thì Admin thấy cờ
 * `effective` nói dối.
 */
export const EnforcedGroupPermissions: readonly string[] = [
  'group.overview.view',
  'group.member.view',
  'group.member.assign_role',
  'group.subteam.manage',
  'group.subteam.member.view',
  'group.activity.view',
  'group.subteam.activity.view',
  'group.invite.view',
  'group.affiliate.view',
  'group.settings.manage',
];
