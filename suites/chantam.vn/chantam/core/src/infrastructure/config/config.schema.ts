import * as Joi from 'joi';

/**
 * Validate biến môi trường ngay lúc khởi động.
 *
 * Thà sập ngay khi boot với thông báo rõ ràng, còn hơn chạy được rồi mới lỗi
 * lúc 2 giờ sáng vì thiếu một biến.
 */
export const ConfigSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .optional(),

  DATABASE_URI: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URI: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  // Khoá 32 ký tự là mức tối thiểu để chống dò ngoại tuyến chữ ký HS256.
  // Ném ngay lúc khởi động còn hơn chạy được với khoá yếu.
  JWT_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().min(60).default(900),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number().min(3_600).default(2_592_000),
  BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12),
  MAX_LOGIN_ATTEMPTS: Joi.number().min(3).max(20).default(5),
  LOGIN_LOCK_SECONDS: Joi.number().min(60).default(900),
  OTP_TTL_SECONDS: Joi.number().min(120).max(1_800).default(300),

  // Trần theo NGUỒN GỌI, bù cho hai cái trần theo tài khoản ở trên: rải một mật
  // khẩu phổ biến qua mười nghìn username thì mỗi tài khoản chỉ sai một lần.
  // Để rộng tay vì nhiều người dùng thật chung một IP sau NAT.
  MAX_LOGIN_ATTEMPTS_PER_IP: Joi.number().min(5).max(500).default(30),
  // Tài khoản mới đẻ ra điểm qua referral và affiliate, nên tạo hàng loạt là
  // một đường gian lận chứ không chỉ là rác.
  MAX_REGISTRATIONS_PER_IP: Joi.number().min(1).max(100).default(5),
  REGISTRATION_WINDOW_SECONDS: Joi.number().min(60).default(3_600),

  // Trần gọi CHUNG cho mọi endpoint, theo IP mỗi phút. Mặc định 600 = 10 lượt/giây:
  // rộng cho một người dùng thật kể cả lúc mở app và tải nhiều màn cùng lúc, nhưng
  // chặn được lụt thô.
  //
  // `min(60)` chứ không cho nhỏ hơn: đặt trần quá thấp là tự khoá chính mình, và
  // một con số như 10/phút sẽ làm client mở app đã bị 429.
  GLOBAL_RATE_LIMIT_PER_MINUTE: Joi.number().min(60).max(100_000).default(600),

  // Mặc định `false` và phải đặt đúng lúc triển khai — xem `trustProxy` trong
  // `domain/ports/config/config.ts` để biết sai mỗi hướng thì hỏng thế nào.
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),

  // Config-only cho EmailOtpSender tương lai. Có From address KHÔNG có nghĩa
  // sender đã gửi được: vẫn cần vendor adapter, credential và domain verify.
  OTP_EMAIL_FROM_ADDRESS: Joi.string().email().allow('').default(''),
  OTP_EMAIL_FROM_NAME: Joi.string().max(100).default('Chân Tâm'),

  GEO_JITTER_RADIUS_METERS: Joi.number().min(50).max(5_000).default(300),

  // Môi trường cho ô chọn "Servers" của Swagger. Dạng `Nhãn=url`, ngăn bằng dấu
  // phẩy. Ví dụ: `Production=https://api.chantam.vn,Staging=https://api-staging.chantam.vn`
  // Bỏ trống thì Swagger chỉ có mục trỏ về chính instance đang mở.
  API_SERVERS: Joi.string().allow('').default(''),

  STORAGE_ENDPOINT: Joi.string().uri().optional(),
  STORAGE_REGION: Joi.string().default('auto'),
  STORAGE_BUCKET: Joi.string().optional(),
  STORAGE_ACCESS_KEY_ID: Joi.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: Joi.string().optional(),
  STORAGE_PUBLIC_BASE_URL: Joi.string().uri().optional(),

  // Gốc web công khai cho link chia sẻ hồ sơ. Bỏ trống thì API trả shareUrl
  // null thay vì đoán một domain không tồn tại.
  WEB_PUBLIC_BASE_URL: Joi.string().uri().allow('').default(''),

  // Khoá 32 byte base64 mã hoá secret Admin cấu hình (SMTP, Zalo...).
  // Sinh bằng: openssl rand -base64 32
  // Bỏ trống thì không lưu được secret nào — fail closed, không lưu bản rõ.
  CONFIG_ENCRYPTION_KEY: Joi.string().allow('').default(''),

  // Khoá băm số điện thoại trong bảng `verified_phones`. Bảng đó cố ý sống lâu
  // hơn tài khoản, nên số phải ở dạng không đọc ngược được.
  // Bỏ trống thì vẫn băm nhưng KHÔNG có khoá — chống trùng vẫn chạy, chỉ là kẻ
  // đọc được database có thể dò ngược ra số vì không gian số VN nhỏ.
  // Sinh bằng: openssl rand -base64 32
  PHONE_HASH_PEPPER: Joi.string().allow('').default(''),

  // Service account JSON của dự án Firebase, mã hoá base64 (F44).
  // Sinh bằng: base64 -w0 service-account.json
  //
  // Base64 chứ không phải JSON thô: chuỗi JSON mang một khoá RSA nhiều dòng,
  // và nó không đi qua nổi một dòng `.env` mà không bị cắt ở ký tự dòng mới.
  //
  // Bỏ trống thì chưa có đường đẩy và `IPushSender` fail-closed. Thông báo trong
  // app vẫn ghi và hiển thị bình thường — hai việc tách rời nhau.
  FCM_SERVICE_ACCOUNT_BASE64: Joi.string().allow('').default(''),

  // M1 temporary category manager allowlist. M6 replaces it with real admin roles.
  // M2 temporary moderation allowlist. M6 replaces it with real admin roles.
  // Sprint 1 temporary rank maintenance operator allowlist. M6 replaces it with real admin roles.
  // Chỉ bootstrap SUPER_ADMIN; sau đó quản trị bằng admin_user_roles.
  ADMIN_BOOTSTRAP_USERNAMES: Joi.string().allow('').default(''),
});
