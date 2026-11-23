import { IPointFeedCache } from '@/domain/ports/cache';
import { IPointFeedResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { PointFeedCacheTtlSeconds } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { IRedisClient } from '../redis/redis.module';

/**
 * Đệm bảng tin điểm chung trên Redis, TTL `PointFeedCacheTtlSeconds`. Mọi phép bắt lỗi tại
 * chỗ: Redis chập chỉ là đọc thẳng database, không thành 500.
 */
@Injectable()
export class PointFeedCache implements IPointFeedCache {
  private readonly logger = new Logger(PointFeedCache.name);

  public constructor(@Inject(IRedisClient) private readonly redis: Redis) {}

  public async read(key: string): Promise<IPointFeedResponseDto | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as IPointFeedResponseDto) : null;
    } catch (error) {
      this.logger.warn(`Không đọc được đệm bảng tin điểm: ${String(error)}`);
      return null;
    }
  }

  public async write(key: string, value: IPointFeedResponseDto): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        PointFeedCacheTtlSeconds,
      );
    } catch (error) {
      this.logger.warn(`Không ghi được đệm bảng tin điểm: ${String(error)}`);
    }
  }
}
