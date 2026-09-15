import { Env, IConfig } from '@/domain/ports/config';

const KnownEnvironments: Env[] = ['development', 'staging', 'production'];

function resolveEnv(value: string | undefined): Env {
  return KnownEnvironments.includes(value as Env)
    ? (value as Env)
    : 'development';
}

export function loadConfig(): IConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
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
    },
    geo: {
      jitterRadiusMeters: Number(process.env.GEO_JITTER_RADIUS_METERS ?? 300),
    },
  };
}
