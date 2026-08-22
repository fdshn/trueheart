import { IModuleAsyncOptions } from '@chantam/service.common-lib/modules';
import { DynamicModule, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IHealthModuleOptions } from './types';

@Module({})
export class HealthModule {
  public static forRootAsync(
    options: IModuleAsyncOptions<IHealthModuleOptions> = {
      useFactory: () => ({}),
    },
  ): DynamicModule {
    return {
      global: options.global,
      module: HealthModule,
      imports: options.imports ?? [],
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: IHealthModuleOptions,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
      exports: [HealthService],
    };
  }
}
