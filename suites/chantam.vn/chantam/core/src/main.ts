import { IAppContext } from '@chantam/service.common-lib/modules';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { IConfig } from './domain/ports/config';

/** Chữ ký callback của bộ phân tích content-type trong Fastify. */
type DoneFn = (error: Error | null, body?: unknown) => void;

/**
 * Coi body rỗng là `{}` khi client đặt `Content-Type: application/json`.
 *
 * Fastify mặc định trả 400 "Body cannot be empty" trong trường hợp đó, nên MỌI
 * endpoint không có body đều vướng: xác nhận nhận hàng, gia hạn bài, đánh dấu
 * đã đọc, chạy đánh giá chu kỳ duy trì. Client mobile thường đặt content-type
 * này cho mọi request, nên đó là một 400 mà người dùng không gửi sai gì cả.
 *
 * JSON hỏng vẫn bị từ chối như cũ — chỉ "không có gì" mới được hiểu là `{}`.
 */
function allowEmptyJsonBody(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request: unknown, payload: string, done: DoneFn) => {
      if (!payload || payload.trim() === '') return done(null, {});

      try {
        done(null, JSON.parse(payload));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Socket.io gắn vào CHÍNH HTTP server mà Fastify đang dùng, nên không mở cổng
  // thứ hai — hạ tầng chỉ cần cho phép nâng cấp WebSocket trên cổng hiện có.
  //
  // `setGlobalPrefix` KHÔNG áp cho WebSocket, nên namespace là `/chat` chứ
  // không phải `/api/v1/chat`.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Trao instance ứng dụng cho DI container TRƯỚC khi listen — đây là cửa sổ
  // duy nhất mà SwaggerModule.setup() còn kịp gắn route.
  app.get<IAppContext>(IAppContext).setApp(app);

  const config = app.get<IConfig>(IConfig);

  app.enableShutdownHooks();

  // Phải SAU `init()` mới thay được bộ phân tích JSON: Nest tự đăng ký một bộ
  // trong `init()`, nên thêm trước đó là đụng "Content type parser
  // 'application/json' already present" và tiến trình chết lúc khởi động.
  await app.init();
  allowEmptyJsonBody(app);

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
