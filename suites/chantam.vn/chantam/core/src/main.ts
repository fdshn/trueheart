import { IAppContext } from '@chantam/service.common-lib/modules';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { IConfig } from './domain/ports/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  // Trao instance ứng dụng cho DI container TRƯỚC khi listen — đây là cửa sổ
  // duy nhất mà SwaggerModule.setup() còn kịp gắn route.
  app.get<IAppContext>(IAppContext).setApp(app);

  const config = app.get<IConfig>(IConfig);

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
