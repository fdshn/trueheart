export type HealthStatus = 'ok' | 'degraded';

export interface IHealthCheckResult {
  name: string;
  healthy: boolean;
  detail?: string;
}

/** Một phép kiểm tra phụ thuộc ngoài (database, cache, hàng đợi...). */
export type HealthIndicator = () => Promise<IHealthCheckResult>;

export interface IHealthReport {
  status: HealthStatus;
  version: string;
  uptimeSeconds: number;
  checks: IHealthCheckResult[];
}

export interface IHealthModuleOptions {
  version?: string;
  indicators?: HealthIndicator[];
}

export const IHealthModuleOptions = Symbol('IHealthModuleOptions');
