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

export interface IAdminConfigRepository {
  hasPermission(userId: string, permission: string): Promise<boolean>;
  getPublishedConfigs(): Promise<ISystemConfigSummary[]>;
  publishSystemConfig(
    command: IPublishSystemConfigCommand,
  ): Promise<ISystemConfigSummary>;
  getAuditLogs(query: IAdminAuditQuery): Promise<IAdminAuditPage>;
}

export const IAdminConfigRepository = Symbol('IAdminConfigRepository');
