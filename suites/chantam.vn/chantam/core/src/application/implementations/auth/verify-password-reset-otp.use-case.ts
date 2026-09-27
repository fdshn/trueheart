import {
  IVerifyPasswordResetOtpCommand,
  IVerifyPasswordResetOtpResult,
  IVerifyPasswordResetOtpUseCase,
} from '@/application/contracts/auth';
import { OtpInvalidException } from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { IRedisClient } from '@/infrastructure/redis/redis.module';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { PasswordResetPurpose } from './request-password-reset.use-case';

export const PasswordResetTokenTtlSeconds = 900;
export const PasswordResetTokenPrefix = 'pwd-reset-token:';

@Injectable()
export class VerifyPasswordResetOtpUseCase implements IVerifyPasswordResetOtpUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IOtpStore)
    private readonly otpStore: IOtpStore,
    @Inject(IRedisClient)
    private readonly redis: Redis,
  ) {}

  public async handle(
    command: IVerifyPasswordResetOtpCommand,
  ): Promise<IVerifyPasswordResetOtpResult> {
    const { reset } = command;
    const user = await this.userRepository.findByIdentifier(
      reset.identifier.trim(),
    );

    // Không tìm thấy tài khoản cũng ném đúng lỗi như mã sai — không tiết lộ
    // tài khoản nào có thật.
    if (!user) throw new OtpInvalidException();

    const valid = await this.otpStore.verify(
      PasswordResetPurpose,
      user.globalId,
      reset.otp,
    );

    if (!valid) throw new OtpInvalidException();

    // Sinh token ngẫu nhiên 32 byte an toàn mật mã học, lưu tạm vào Redis có thời hạn.
    const resetToken = randomBytes(32).toString('hex');
    await this.redis.set(
      `${PasswordResetTokenPrefix}${resetToken}`,
      user.globalId,
      'EX',
      PasswordResetTokenTtlSeconds,
    );

    return {
      resetToken,
      expiresInSeconds: PasswordResetTokenTtlSeconds,
    };
  }
}
