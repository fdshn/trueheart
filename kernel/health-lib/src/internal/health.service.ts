import { Inject, Injectable } from '@nestjs/common';
import {
  IHealthCheckResult,
  IHealthModuleOptions,
  IHealthReport,
} from './types';

@Injectable()
export class HealthService {
  public constructor(
    @Inject(IHealthModuleOptions)
    private readonly options: IHealthModuleOptions,
  ) {}

  public async check(): Promise<IHealthReport> {
    const indicators = this.options.indicators ?? [];

    // Một indicator hỏng không được làm sập cả endpoint health — nếu không thì
    // hệ thống giám sát chỉ thấy lỗi 500 mà không biết thành phần nào có vấn đề.
    const checks: IHealthCheckResult[] = await Promise.all(
      indicators.map(async (indicator) => {
        try {
          return await indicator();
        } catch (error) {
          return {
            name: 'unknown',
            healthy: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return {
      status: checks.every((check) => check.healthy) ? 'ok' : 'degraded',
      version: this.options.version ?? 'unknown',
      uptimeSeconds: Math.floor(process.uptime()),
      checks,
    };
  }
}
