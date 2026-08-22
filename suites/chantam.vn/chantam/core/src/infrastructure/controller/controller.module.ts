import { IConfig } from '@/domain/ports/config';
import {
  BaseControllerModule,
  DocsModule,
  IAppContext,
} from '@chantam/service.common-lib/modules';
import { Global, INestApplication, Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';

@Global()
@Module({
  imports: [
    ApiModule,
    DocsModule.forRootAsync({
      inject: [IAppContext, IConfig],
      useFactory: (
        appContext: IAppContext<INestApplication>,
        config: IConfig,
      ) => ({
        title: 'Chân Tâm — Core API',
        description:
          'API lõi của nền tảng cho–tặng & từ thiện cộng đồng Chân Tâm (True Heart)',
        version: config.version,
        app: () => appContext.waitForApp(),
      }),
    }),
    BaseControllerModule.forRoot(),
  ],
})
export class ControllerModule {}
