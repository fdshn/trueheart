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
  getAuditLogs(limit: number): Promise<IAdminAuditSummary[]>;
}

export const IAdminConfigRepository = Symbol('IAdminConfigRepository');
