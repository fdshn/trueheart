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
 */
function parseDocsServers(raw: string | undefined): {
  url: string;
  description: string;
}[] {
  if (!raw?.trim()) return [];

  return raw
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
    },
    // Mục "máy đang chạy" luôn đứng ĐẦU. Swagger UI chọn mục đầu tiên làm mặc
    // định, nên đặt production lên trước là mời người ta bấm "Try it out"
    // thẳng vào dữ liệu thật.
    docsServers: [
      { url: `http://localhost:${port}`, description: 'Máy đang chạy (local)' },
      ...parseDocsServers(process.env.API_SERVERS),
    ],

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
