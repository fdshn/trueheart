import { Env, IConfig } from '@/domain/ports/config';

const KnownEnvironments: Env[] = ['development', 'staging', 'production'];

export function loadConfig(): IConfig {
  const env = process.env.NODE_ENV as Env;

  return {
    port: Number(process.env.PORT ?? 3000),
    env: KnownEnvironments.includes(env) ? env : 'development',
    version: process.env.npm_package_version ?? '0.0.0',
  };
}
