export type Env = 'development' | 'staging' | 'production';

export interface IConfig {
  port: number;
  env: Env;
  version: string;
}

export const IConfig = Symbol('IConfig');
