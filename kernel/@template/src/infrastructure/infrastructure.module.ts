import { IConfig } from '@/domain/ports/config';
import {
  AppContextModule,
  BaseControllerModule,
  DocsModule,
  IAppContext,
} from '@chantam/service.common-lib/modules';
import { HealthModule } from '@chantam/service.health-lib';
import { LoggerModule } from '@chantam/service.logger-lib';
import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [
    AppContextModule,
    LoggerModule.forRoot(),
    ConfigModule,
    BaseControllerModule.forRoot(),
    DocsModule.forRootAsync({
      inject: [IAppContext, IConfig],
      useFactory: (
        appContext: IAppContext<INestApplication>,
        config: IConfig,
      ) => ({
        title: 'changeme',
        description: 'CHANGEME',
        version: config.version,
        app: () => appContext.waitForApp(),
      }),
    }),
    HealthModule.forRootAsync({
      inject: [IConfig],
      useFactory: (config: IConfig) => ({ version: config.version }),
    }),
    // Khi service cần database, bổ sung PersistenceModule, EntityModule,
    // RepositoryModule, ControllerModule theo mẫu ở suites/chantam.vn/chantam/core.
  ],
})
export class InfrastructureModule {}
