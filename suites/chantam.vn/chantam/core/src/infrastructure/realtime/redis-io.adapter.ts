import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Socket.io qua Redis pub/sub (CHARITY-PROJECT-LIFECYCLE §3.15, biện pháp 1).
 *
 * `IoAdapter` mặc định chỉ phát tới socket của CHÍNH instance đó: chạy hai container core thì
 * tin nhắn chat và tín hiệu dự án gửi ở container A không tới người đang nối vào container B.
 * Redis đã có sẵn nên gắn adapter của nó.
 *
 * Redis không nối được lúc khởi động thì quay về adapter mặc định và ghi cảnh báo — một
 * instance vẫn chạy đúng như trước; realtime chỉ là gợi ý, REST mới là nguồn sự thật.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private clients: Redis[] = [];

  public constructor(app: INestApplicationContext) {
    super(app);
  }

  public async connect(uri: string): Promise<boolean> {
    const publisher = new Redis(uri, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    const subscriber = publisher.duplicate();
    for (const client of [publisher, subscriber])
      client.on('error', (error) =>
        this.logger.warn(`Redis adapter: ${error.message}`),
      );
    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.adapterConstructor = createAdapter(publisher, subscriber);
      this.clients = [publisher, subscriber];
      return true;
    } catch (error) {
      this.logger.warn(
        `Không nối được Redis cho Socket.io, dùng adapter một instance: ${String(error)}`,
      );
      publisher.disconnect();
      subscriber.disconnect();
      return false;
    }
  }

  public createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as {
      adapter: (constructor: unknown) => void;
    };
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  public async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(
      this.clients.map((client) => client.quit().catch(() => undefined)),
    );
  }
}
