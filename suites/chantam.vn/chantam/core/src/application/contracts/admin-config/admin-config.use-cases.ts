import {
  IAdminAuditSummary,
  ISystemConfigSummary,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IGetAdminConfigsCommand {
  actorUserId: string;
}
export interface IGetAdminConfigsResult {
  configs: ISystemConfigSummary[];
}
export interface IGetAdminConfigsUseCase extends IUseCase<
  IGetAdminConfigsCommand,
  IGetAdminConfigsResult
> {}
export const IGetAdminConfigsUseCase = Symbol('IGetAdminConfigsUseCase');

export interface IPublishAdminConfigBodyDto {
  key: string;
  value: unknown;
  valueType: string;
  reason: string;
}

export const SupportedSystemConfigKeys = [
  'discovery.default_radius_meters',
  'discovery.min_radius_meters',
  'discovery.max_radius_meters',
  'group.default_radius_meters',
  'group.min_radius_meters',
  'group.max_radius_meters',
  'affiliate.active_member_window_days',
  'rank.maintenance_period_months',
  'point.referral_daily_cap',
  'point.transaction_daily_cap',
] as const;

export interface IPublishAdminConfigCommand {
  actorUserId: string;
  systemConfig: IPublishAdminConfigBodyDto;
}
export interface IPublishAdminConfigResult {
  config: ISystemConfigSummary;
}
export interface IPublishAdminConfigUseCase extends IUseCase<
  IPublishAdminConfigCommand,
  IPublishAdminConfigResult
> {}
export const IPublishAdminConfigUseCase = Symbol('IPublishAdminConfigUseCase');

export interface IGetAdminAuditLogsCommand {
  actorUserId: string;
  actorFilter?: string;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}
export interface IGetAdminAuditLogsResult {
  logs: IAdminAuditSummary[];
  meta: IPaginationMetaDto;
}
export interface IGetAdminAuditLogsUseCase extends IUseCase<
  IGetAdminAuditLogsCommand,
  IGetAdminAuditLogsResult
> {}
export const IGetAdminAuditLogsUseCase = Symbol('IGetAdminAuditLogsUseCase');
