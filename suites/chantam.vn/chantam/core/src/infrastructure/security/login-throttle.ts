import { TooManyLoginAttemptsException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { ILoginThrottle } from '@/domain/ports/security';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { IRedisClient } from '../redis/redis.module';

@Injectable()
export class LoginThrottle implements ILoginThrottle {
  private readonly logger = new Logger(LoginThrottle.name);

  public constructor(
    @Inject(IRedisClient) private readonly redis: Redis,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  /**
   * Băm định danh trước khi làm khoá Redis.
   *
   * Định danh có thể là email hoặc số điện thoại — dữ liệu cá nhân. Redis
   * thường không được mã hoá và ai có quyền đọc cũng liệt kê được toàn bộ khoá,
   * nên không bao giờ đưa giá trị gốc vào tên khoá.
   */
  private key(identifier: string): string {
    const digest = createHash('sha256')
      .update(identifier.trim().toLowerCase())
      .digest('hex');

    return `login-attempts:${digest}`;
  }

  public async assertNotLocked(identifier: string): Promise<void> {
    const raw = await this.safely(() => this.redis.get(this.key(identifier)));

    if (raw === null) return;

    const attempts = Number(raw);

    if (attempts < this.config.auth.maxLoginAttempts) return;

    const ttl = await this.safely(() => this.redis.ttl(this.key(identifier)));

    throw new TooManyLoginAttemptsException(
      ttl && ttl > 0 ? ttl : this.config.auth.loginLockSeconds,
    );
  }

  public async registerFailure(identifier: string): Promise<void> {
    const key = this.key(identifier);

    await this.safely(async () => {
      // INCR rồi EXPIRE trong một pipeline: cửa sổ khoá tính từ lần sai ĐẦU
      // TIÊN, không gia hạn theo mỗi lần sai. Nếu gia hạn, kẻ tấn công chậm rãi
      // sẽ khoá vĩnh viễn tài khoản của nạn nhân.
      const attempts = await this.redis.incr(key);

      if (attempts === 1)
        await this.redis.expire(key, this.config.auth.loginLockSeconds);

      return attempts;
    });
  }

  public async reset(identifier: string): Promise<void> {
    await this.safely(() => this.redis.del(this.key(identifier)));
  }

  /**
   * Redis chết thì ghi log rồi cho qua.
   *
   * Chống dò mật khẩu là lớp bảo vệ phụ; mật khẩu vẫn được bcrypt bảo vệ. Chặn
   * đăng nhập của toàn bộ người dùng chỉ vì Redis hỏng là đánh đổi tệ hơn.
   */
  private async safely<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.logger.warn(
        `Redis không phản hồi, bỏ qua kiểm tra: ${String(error)}`,
      );

      return null;
    }
  }
}
