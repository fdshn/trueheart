import { S3Client } from '@aws-sdk/client-s3';
import { IModuleAsyncOptions } from '@chantam/service.common-lib/modules';
import { DynamicModule, Module } from '@nestjs/common';
import { IObjectStorage } from '../contracts';
import {
  IS3Client,
  IStorageModuleOptions,
  IStorageOptions,
} from './storage-options';
import { StorageService } from './storage.service';

@Module({})
export class StorageModule {
  public static forRootAsync(
    options: IModuleAsyncOptions<IStorageModuleOptions>,
  ): DynamicModule {
    return {
      global: true,
      module: StorageModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: IStorageOptions,
          inject: options.inject,
          useFactory: options.useFactory,
        },
        {
          provide: IS3Client,
          inject: [IStorageOptions],
          useFactory: (config: IStorageModuleOptions) =>
            new S3Client({
              endpoint: config.endpoint,
              region: config.region,
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              },
              forcePathStyle: true,
            }),
        },
        { provide: IObjectStorage, useClass: StorageService },
      ],
      exports: [IObjectStorage],
    };
  }
}
