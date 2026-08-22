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
    geo: {
      jitterRadiusMeters: Number(process.env.GEO_JITTER_RADIUS_METERS ?? 300),
    },
  };
}
