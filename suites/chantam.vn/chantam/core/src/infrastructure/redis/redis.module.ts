import { IConfig } from '@/domain/ports/config';
import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';

export const IRedisClient = Symbol('IRedisClient');

/**
 * Kết nối Redis dùng chung.
 *
 * Hiện chỉ phục vụ chống dò mật khẩu (F02). Về sau còn dùng cho cache cấu hình
 * Home và hàng đợi BullMQ, nên tách thành module riêng ngay từ đầu.
 */
@Global()
@Module({
  providers: [
    {
      provide: IRedisClient,
      inject: [IConfig],
      useFactory: (config: IConfig) => {
        const client = new Redis(config.redis.uri, {
          // Redis chết KHÔNG được làm sập cả API. Chống dò mật khẩu là lớp bảo
          // vệ phụ; mất nó thì đăng nhập vẫn phải chạy. Bên gọi tự bắt lỗi.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
        });

        // ioredis phát 'error' bất đồng bộ; không lắng nghe thì Node coi đó là
        // unhandled error và giết tiến trình — đúng thứ ta vừa nói là không được xảy ra.
        client.on('error', (error) =>
          new Logger('Redis').warn(`Mất kết nối: ${error.message}`),
        );

        return client;
      },
    },
  ],
  exports: [IRedisClient],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  public constructor(
    @Inject(IRedisClient)
    private readonly redis: Redis,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(`Không đóng được kết nối Redis: ${String(error)}`);
    }
  }
}
