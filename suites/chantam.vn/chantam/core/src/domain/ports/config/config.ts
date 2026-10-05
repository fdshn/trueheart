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
  /**
   * Số lần đăng nhập sai tối đa từ MỘT địa chỉ IP trong cùng cửa sổ khoá.
   *
   * Khác `maxLoginAttempts` — cái đó đếm theo tài khoản, nên kẻ rải một mật
   * khẩu phổ biến qua mười nghìn username chỉ sai một lần trên mỗi tài khoản và
   * không bao giờ chạm trần. Đặt cao hơn hẳn ngưỡng theo tài khoản vì nhiều
   * người dùng thật có thể chung một IP sau NAT.
   */
  maxLoginAttemptsPerIp: number;
  /** Số tài khoản tối đa tạo được từ một địa chỉ IP trong một cửa sổ. */
  maxRegistrationsPerIp: number;
  /**
   * Trần gọi CHUNG cho mọi endpoint, tính theo IP mỗi phút.
   *
   * Khác `maxLoginAttemptsPerIp` và `maxRegistrationsPerIp`: hai cái đó chặn theo
   * HÀNH VI ở từng chỗ gọi, nên một endpoint mới quên gọi chúng thì không có gì
   * đỡ. Cái này là lớp chặn chung, áp cho mọi route.
   */
  globalRateLimitPerMinute: number;
  /**
   * `true` khi service đứng SAU proxy tin cậy (nginx, Cloudflare).
   *
   * BẮT BUỘC đúng, và sai theo hướng nào cũng nguy:
   *
   * - Đứng sau proxy mà để `false`: `request.ip` là IP của proxy, nên MỌI người
   *   dùng chung một bucket. Trần chung sẽ đánh sập cả API ngay khi tổng lưu lượng
   *   vượt ngưỡng — lớp bảo vệ trở thành lỗ tự gây.
   * - KHÔNG sau proxy mà để `true`: ai cũng tự khai `X-Forwarded-For` được, nên
   *   trần chung thành vô nghĩa vì mỗi request là một IP mới.
   *
   * Nên nó là env riêng, mặc định `false`, và phải đặt đúng lúc triển khai.
   */
  trustProxy: boolean;
  /** Độ dài cửa sổ đếm đăng ký, tính bằng giây. */
  registrationWindowSeconds: number;
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

export interface ISecurityConfig {
  /**
   * Khoá 32 byte dạng base64 để mã hoá secret Admin cấu hình được (mật khẩu
   * SMTP, API key Zalo...). Sinh bằng: openssl rand -base64 32
   *
   * Cố ý KHÔNG có giá trị mặc định: thiếu khoá thì không lưu được secret nào,
   * còn hơn lưu bản rõ xuống database.
   */
  secretEncryptionKey: string;

  /**
   * Khoá băm số điện thoại trong `verified_phones`.
   *
   * Bảng đó cố ý sống lâu hơn tài khoản — kể cả tài khoản đã xoá — nên số phải
   * ở dạng không đọc ngược được. Bỏ trống thì vẫn băm nhưng không có khoá:
   * chống trùng vẫn chạy, chỉ là người đọc được database dò ngược ra số được vì
   * không gian số Việt Nam đủ nhỏ để duyệt hết.
   */
  phoneHashPepper: string;
}

export interface IWebConfig {
  /**
   * Gốc URL của web công khai, dùng dựng link chia sẻ hồ sơ.
   *
   * Để rỗng khi chưa có web thật. Khi rỗng thì API trả `shareUrl: null` chứ
   * KHÔNG bịa ra một domain — link hỏng còn tệ hơn là không có link.
   */
  publicBaseUrl: string;
}

export interface IAdminBootstrapConfig {
  /** Chỉ dùng để gán SUPER_ADMIN lúc khởi tạo; quyền vận hành nằm trong DB. */
  usernames: string[];
}

export interface IPushConfig {
  /**
   * Service account JSON của dự án Firebase, đã mã hoá base64 (F44).
   *
   * Giữ ở dạng base64 THÔ, chưa giải mã, vì một chuỗi JSON nhiều dòng với khoá
   * RSA bên trong không đi qua nổi một dòng `.env` mà không bị cắt ở ký tự dòng
   * mới. Sinh bằng: `base64 -w0 service-account.json`
   *
   * Để rỗng thì chưa có đường đẩy, và `IPushSender` fail-closed. Thông báo TRONG
   * APP không phụ thuộc vào nó — mất đường đẩy không được làm mất thông báo.
   */
  serviceAccountBase64: string;
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
  adminBootstrap: IAdminBootstrapConfig;
  web: IWebConfig;
  security: ISecurityConfig;
  push: IPushConfig;

  /**
   * Môi trường cho ô chọn của Swagger. Mục đầu luôn trỏ về chính instance đang
   * chạy; phần còn lại khai qua biến `API_SERVERS`.
   */
  docsServers: IDocsServerConfig[];
}

export const IConfig = Symbol('IConfig');
