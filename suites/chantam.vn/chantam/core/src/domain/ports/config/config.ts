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

/** Một môi trường hiện trong ô chọn "Servers" của Swagger UI. */
export interface IDocsServerConfig {
  url: string;
  description: string;
}

export interface IOtpEmailConfig {
  /** Sender identity reserved for future EmailOtpSender; does not enable delivery. */
  fromAddress: string;
  fromName: string;
}

export interface IStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export interface ICategoryAdminConfig {
  /** Temporary M1 allowlist. Replaced by M6 Admin CMS roles. */
  usernames: string[];
}

export interface IPostOperatorConfig {
  /** Temporary M2 allowlist. Replaced by M6 Admin CMS roles. */
  usernames: string[];
}

export interface IConfig {
  port: number;
  env: Env;
  version: string;
  database: IDatabaseConfig;
  redis: { uri: string };
  auth: IAuthConfig;
  geo: IGeoConfig;
  storage: IStorageConfig;
  otpEmail: IOtpEmailConfig;
  categoryAdmin: ICategoryAdminConfig;
  postOperator: IPostOperatorConfig;

  /**
   * Môi trường cho ô chọn của Swagger. Mục đầu luôn trỏ về chính instance đang
   * chạy; phần còn lại khai qua biến `API_SERVERS`.
   */
  docsServers: IDocsServerConfig[];
}

export const IConfig = Symbol('IConfig');
