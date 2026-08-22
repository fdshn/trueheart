export type Env = 'development' | 'staging' | 'production';

export interface IDatabaseConfig {
  /** Connection string PostgreSQL. Database phải có extension PostGIS. */
  default: string;
}

export interface IGeoConfig {
  /**
   * Bán kính làm nhiễu toạ độ công khai (mét).
   *
   * Đặc tả mục 1.3: chỉ người được duyệt nhận mới biết địa chỉ chính xác.
   */
  jitterRadiusMeters: number;
}

export interface IConfig {
  port: number;
  env: Env;
  version: string;
  database: IDatabaseConfig;
  redis: { uri: string };
  geo: IGeoConfig;
}

export const IConfig = Symbol('IConfig');
