export interface ISystemConfigSummary {
  id: number;
  key: string;
  value: unknown;
  valueType: string;
  version: number;
  effectiveFrom: Date;
  sensitive: boolean;
}

export interface IAdminAuditSummary {
  id: number;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  createdAt: Date;
}

/**
 * Bộ lọc audit. Mọi trường đều không bắt buộc — bỏ trống thì không lọc theo
 * trường đó, chứ không phải lọc theo chuỗi rỗng.
 */
export interface IAdminAuditQuery {
  readonly actorUserId?: string;
  readonly action?: string;
  readonly resourceType?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly skip: number;
  readonly take: number;
}

export interface IAdminAuditPage {
  readonly entries: IAdminAuditSummary[];
  readonly total: number;
}

export interface IPublishSystemConfigCommand {
  actorUserId: string;
  key: string;
  value: unknown;
  valueType: string;
  reason: string;
}

export interface IAdminRoleSummary {
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly permissions: string[];
}

export interface IAdminRoleAssignment {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly roleCode: string;
  readonly reason: string;
}

export interface IAdminConfigRepository {
  hasPermission(userId: string, permission: string): Promise<boolean>;
  getPublishedConfigs(): Promise<ISystemConfigSummary[]>;
  /**
   * Giá trị JSON của bản đang hiệu lực cho một khoá, hoặc `null` khi chưa có.
   *
   * Trả `unknown` chứ không kiểu cụ thể: nội dung do Admin nhập, nên nơi dùng
   * phải tự chuẩn hoá và tự chịu trường hợp rác. Tin vào hình dạng ở đây là mở
   * đường cho một dòng config sai làm chết nghiệp vụ.
   */
  getConfigValue(key: string): Promise<unknown>;
  publishSystemConfig(
    command: IPublishSystemConfigCommand,
  ): Promise<ISystemConfigSummary>;
  getAuditLogs(query: IAdminAuditQuery): Promise<IAdminAuditPage>;
  listRoles(): Promise<IAdminRoleSummary[]>;
  grantRole(assignment: IAdminRoleAssignment): Promise<void>;
  /**
   * Thu hồi role. Phải từ chối khi đó là SUPER_ADMIN cuối cùng — mất người cuối
   * cùng là không còn ai cấp lại quyền cho bất kỳ ai, kể cả chính mình.
   */
  revokeRole(assignment: IAdminRoleAssignment): Promise<void>;
}

export const IAdminConfigRepository = Symbol('IAdminConfigRepository');
