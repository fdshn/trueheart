import { Env, IConfig } from '@/domain/ports/config';

const KnownEnvironments: Env[] = ['development', 'staging', 'production'];

function resolveEnv(value: string | undefined): Env {
  return KnownEnvironments.includes(value as Env)
    ? (value as Env)
    : 'development';
}

/**
 * Đọc `API_SERVERS` dạng `Nhãn=url,Nhãn=url`.
 *
 * Mục sai định dạng thì ném ngay lúc khởi động chứ không bỏ qua im lặng: bỏ qua
 * nghĩa là người ta mở Swagger, không thấy môi trường mình vừa khai, rồi đi tìm
 * lỗi ở chỗ khác.
 *
 * Trả `undefined` khi không khai gì — khác hẳn với mảng rỗng, vì bên gọi cần
 * phân biệt "không khai" (rơi về localhost) với "khai rồi" (dùng đúng danh sách).
 */
function parseDocsServers(raw: string | undefined):
  | {
      url: string;
      description: string;
    }[]
  | undefined {
  if (!raw?.trim()) return undefined;

  const servers = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('=');
      const description = entry.slice(0, separator).trim();
      const url = entry.slice(separator + 1).trim();

      if (separator < 1 || !url)
        throw new Error(
          `API_SERVERS sai định dạng ở mục "${entry}". Đúng phải là: Nhãn=https://...`,
        );

      if (!/^https?:\/\//.test(url))
        throw new Error(
          `API_SERVERS: "${url}" phải bắt đầu bằng http:// hoặc https://`,
        );

      return { url, description };
    });

  // Chuỗi chỉ toàn dấu phẩy cũng coi như không khai.
  return servers.length > 0 ? servers : undefined;
}

export function loadConfig(): IConfig {
  const port = Number(process.env.PORT ?? 3000);
  return {
    port,
    env: resolveEnv(process.env.NODE_ENV),
    version: process.env.npm_package_version ?? '0.0.0',
    database: {
      default: process.env.DATABASE_URI!,
    },
    redis: {
      uri: process.env.REDIS_URI!,
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET!,
      accessTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
      refreshTtlSeconds: Number(
        process.env.REFRESH_TOKEN_TTL_SECONDS ?? 2_592_000,
      ),
      bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
      maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
      loginLockSeconds: Number(process.env.LOGIN_LOCK_SECONDS ?? 900),
      otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
      maxLoginAttemptsPerIp: Number(
        process.env.MAX_LOGIN_ATTEMPTS_PER_IP ?? 30,
      ),
      maxRegistrationsPerIp: Number(process.env.MAX_REGISTRATIONS_PER_IP ?? 5),
      registrationWindowSeconds: Number(
        process.env.REGISTRATION_WINDOW_SECONDS ?? 3_600,
      ),
    },
    // Khai `API_SERVERS` thì DÙNG ĐÚNG danh sách đó, không chèn localhost.
    //
    // Swagger UI lấy mục đầu tiên làm mặc định. Trên server thật, chèn
    // localhost lên đầu khiến người mở tài liệu bấm "Try it out" vào
    // `http://localhost:8080` — tức máy của chính họ, không phải API đang đọc —
    // nên nút đó vô dụng. Ngược lại, máy dev không khai gì thì vẫn chỉ có
    // localhost như trước.
    //
    // Rủi ro cũ (bấm nhầm sang môi trường khác) được chặn ở chỗ khác: mỗi
    // server chỉ khai CHÍNH NÓ, xem `deploy/bootstrap.sh`.
    docsServers: parseDocsServers(process.env.API_SERVERS) ?? [
      { url: `http://localhost:${port}`, description: 'Máy đang chạy (local)' },
    ],

    otpEmail: {
      fromAddress: process.env.OTP_EMAIL_FROM_ADDRESS ?? '',
      fromName: process.env.OTP_EMAIL_FROM_NAME ?? 'Chân Tâm',
    },

    adminBootstrap: {
      usernames: (process.env.ADMIN_BOOTSTRAP_USERNAMES ?? '')
        .split(',')
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    },

    web: {
      publicBaseUrl: (process.env.WEB_PUBLIC_BASE_URL ?? '').replace(
        /\/+$/,
        '',
      ),
    },

    security: {
      secretEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY ?? '',
    },

    storage: {
      endpoint: process.env.STORAGE_ENDPOINT ?? '',
      region: process.env.STORAGE_REGION ?? 'auto',
      bucket: process.env.STORAGE_BUCKET ?? '',
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
      publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
    },

    geo: {
      jitterRadiusMeters: Number(process.env.GEO_JITTER_RADIUS_METERS ?? 300),
    },
  };
}
