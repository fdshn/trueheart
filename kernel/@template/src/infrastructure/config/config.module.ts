import { IConfig } from '@/domain/ports/config';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { loadConfig } from './config.loader';
import { ConfigSchema } from './config.schema';

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
