import { IAdminDashboard } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

/** Cửa sổ mặc định cho những con số "trong kỳ". */
export const DefaultDashboardWindowDays = 30;

/** Trần trên: cửa sổ quá dài làm mọi câu đếm quét gần hết bảng. */
export const MaxDashboardWindowDays = 365;

export interface IGetAdminDashboardCommand {
  actorUserId: string;
  windowDays?: number;
}

export interface IGetAdminDashboardResult {
  dashboard: IAdminDashboard;
}

export interface IGetAdminDashboardUseCase extends IUseCase<
  IGetAdminDashboardCommand,
  IGetAdminDashboardResult
> {}

export const IGetAdminDashboardUseCase = Symbol('IGetAdminDashboardUseCase');
