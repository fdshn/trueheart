import { ModuleMetadata } from '@nestjs/common';

/** Hình dạng chuẩn cho mọi `forRootAsync()` trong monorepo. */
export interface IModuleAsyncOptions<Options> {
  global?: boolean;
  imports?: ModuleMetadata['imports'];
  inject?: any[];
  useFactory: (...args: any[]) => Options | Promise<Options>;
}
