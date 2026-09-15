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

export interface IAuthConfig {
  /** Khoá ký JWT, tối thiểu 32 ký tự. Sinh bằng: openssl rand -base64 48 */
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  bcryptRounds: number;
  /** Số lần đăng nhập sai liên tiếp trước khi khoá tạm (F02). */
  maxLoginAttempts: number;
  /** Thời gian khoá tạm sau khi vượt ngưỡng, tính bằng giây. */
  loginLockSeconds: number;
  /** Tuổi thọ mã xác minh đặt lại mật khẩu, tính bằng giây. */
  otpTtlSeconds: number;
}

export interface IConfig {
  port: number;
  env: Env;
  version: string;
  database: IDatabaseConfig;
  redis: { uri: string };
  auth: IAuthConfig;
  geo: IGeoConfig;
}

export const IConfig = Symbol('IConfig');
