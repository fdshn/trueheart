import { OtpTooSoonException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IOtpIssueResult, IOtpStore } from '@/domain/ports/security';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomInt } from 'node:crypto';
import { IRedisClient } from '../redis/redis.module';

/** Số lần nhập sai tối đa trước khi mã bị huỷ. */
const MaxVerifyAttempts = 5;

/** Khoảng chờ tối thiểu giữa hai lần xin mã, tính bằng giây. */
const ResendCooldownSeconds = 60;

@Injectable()
export class OtpStore implements IOtpStore {
  public constructor(
    @Inject(IRedisClient) private readonly redis: Redis,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  /** Băm cả chủ thể lẫn mã — chủ thể có thể là email hoặc SĐT. */
  private key(purpose: string, subject: string): string {
    const digest = createHash('sha256')
      .update(`${purpose}:${subject.trim().toLowerCase()}`)
      .digest('hex');

    return `otp:${digest}`;
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  public async issue(
    purpose: string,
    subject: string,
  ): Promise<IOtpIssueResult> {
    const key = this.key(purpose, subject);
    const ttl = this.config.auth.otpTtlSeconds;

    const remaining = await this.redis.ttl(key);

    // Còn mã cũ và chưa qua thời gian chờ thì từ chối. Không có chốt này thì
    // endpoint quên mật khẩu trở thành công cụ dội tin nhắn vào một số điện
    // thoại bất kỳ — nạn nhân không cần có tài khoản vẫn bị làm phiền.
    if (remaining > ttl - ResendCooldownSeconds)
      throw new OtpTooSoonException(remaining - (ttl - ResendCooldownSeconds));

    // randomInt của crypto, không phải Math.random: mã 6 chữ số sinh bằng bộ
    // sinh giả ngẫu nhiên thường có thể đoán được khi biết vài mã trước đó.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.redis
      .multi()
      .hset(key, { hash: this.hashCode(code), attempts: '0' })
      .expire(key, ttl)
      .exec();

    return { code, expiresInSeconds: ttl };
  }

  public async verify(
    purpose: string,
    subject: string,
    code: string,
  ): Promise<boolean> {
    const key = this.key(purpose, subject);
    const stored = await this.redis.hgetall(key);

    if (!stored?.hash) return false;

    if (Number(stored.attempts ?? 0) >= MaxVerifyAttempts) {
      await this.redis.del(key);

      return false;
    }

    if (stored.hash !== this.hashCode(code)) {
      await this.redis.hincrby(key, 'attempts', 1);

      return false;
    }

    // Đúng thì xoá ngay — mỗi mã chỉ dùng được một lần.
    await this.redis.del(key);

    return true;
  }
}
