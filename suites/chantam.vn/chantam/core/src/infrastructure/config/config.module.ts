import { IConfig } from '@/domain/ports/config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { loadConfig } from './config.loader';
import { ConfigSchema } from './config.schema';

/**
 * Bọc `@nestjs/config` lại thành một token `IConfig` có kiểu chặt chẽ.
 *
 * Use case và repository chỉ biết tới `IConfig` của tầng domain, không biết
 * `ConfigService` — nhờ vậy chúng không phụ thuộc vào framework.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      validationSchema: ConfigSchema,
      validationOptions: { abortEarly: false },
    }),
  ],
  providers: [{ provide: IConfig, useFactory: loadConfig }],
  exports: [IConfig],
})
export class ConfigModule {}
