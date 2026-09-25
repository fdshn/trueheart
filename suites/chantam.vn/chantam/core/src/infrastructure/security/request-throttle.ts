import { TooManyRequestsException } from '@/domain/exceptions';
import { IRequestThrottle } from '@/domain/ports/security';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { IRedisClient } from '../redis/redis.module';

@Injectable()
export class RequestThrottle implements IRequestThrottle {
  private readonly logger = new Logger(RequestThrottle.name);

  public constructor(@Inject(IRedisClient) private readonly redis: Redis) {}

  /**
   * Băm nguồn gọi trước khi làm khoá Redis.
   *
   * Địa chỉ IP là dữ liệu cá nhân theo nghĩa nó gắn được với một người. Redis
   * thường không mã hoá và ai đọc được cũng liệt kê hết khoá, nên không đưa giá
   * trị gốc vào tên khoá — y như `LoginThrottle` làm với email và SĐT.
   */
  private key(bucket: string, value: string): string {
    const digest = createHash('sha256')
      .update(`${bucket}:${value.trim().toLowerCase()}`)
      .digest('hex');

    return `throttle:${bucket}:${digest}`;
  }

  public async assertWithinLimit(params: {
    bucket: string;
    key: string;
    limit: number;
  }): Promise<void> {
    const redisKey = this.key(params.bucket, params.key);
    const raw = await this.safely(() => this.redis.get(redisKey));

    if (raw === null) return;

    if (Number(raw) < params.limit) return;

    const ttl = await this.safely(() => this.redis.ttl(redisKey));

    throw new TooManyRequestsException(ttl && ttl > 0 ? ttl : 60);
  }

  public async registerHit(params: {
    bucket: string;
    key: string;
    windowSeconds: number;
  }): Promise<void> {
    const redisKey = this.key(params.bucket, params.key);

    await this.safely(async () => {
      // Cửa sổ tính từ lần đếm ĐẦU TIÊN, không gia hạn theo mỗi lần — gia hạn
      // thì một nguồn gọi chậm rãi sẽ tự khoá mình vĩnh viễn, và với đăng nhập
      // thì kẻ tấn công khoá được cả một dải IP của người khác.
      const hits = await this.redis.incr(redisKey);

      if (hits === 1) await this.redis.expire(redisKey, params.windowSeconds);

      return hits;
    });
  }

  /**
   * Redis chết thì ghi log rồi cho qua.
   *
   * Giống `LoginThrottle`: đây là lớp bảo vệ phụ. Chặn toàn bộ người dùng đăng
   * ký và đăng nhập chỉ vì Redis hỏng là đánh đổi tệ hơn hẳn.
   */
  private async safely<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.logger.warn(
        `Redis không phản hồi, bỏ qua kiểm tra trần gọi: ${String(error)}`,
      );

      return null;
    }
  }
}
