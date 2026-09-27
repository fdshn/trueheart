import {
  IConfirmPasswordResetCommand,
  IConfirmPasswordResetResult,
  IConfirmPasswordResetUseCase,
} from '@/application/contracts/auth';
import { OtpInvalidException } from '@/domain/exceptions';
import {
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { IRedisClient } from '@/infrastructure/redis/redis.module';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IPasswordService, ITokenDenyList } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PasswordResetPurpose } from './request-password-reset.use-case';
import { PasswordResetTokenPrefix } from './verify-password-reset-otp.use-case';

@Injectable()
export class ConfirmPasswordResetUseCase implements IConfirmPasswordResetUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(IOtpStore)
    private readonly otpStore: IOtpStore,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
    @Inject(IRedisClient)
    private readonly redis: Redis,
  ) {}

  public async handle(
    command: IConfirmPasswordResetCommand,
  ): Promise<IConfirmPasswordResetResult> {
    const { reset } = command;
    let user: IUserEntity | null = null;

    if (reset.resetToken?.trim()) {
      const key = `${PasswordResetTokenPrefix}${reset.resetToken.trim()}`;
      const userId = await this.redis.get(key);
      if (!userId) throw new OtpInvalidException();

      // Dùng 1 lần: xoá ngay khỏi Redis
      await this.redis.del(key);

      user = await this.userRepository.findOneBy({ globalId: userId });
      if (!user) throw new OtpInvalidException();
    } else if (reset.identifier?.trim() && reset.otp?.trim()) {
      user = await this.userRepository.findByIdentifier(
        reset.identifier.trim(),
      );

      // Không tìm thấy tài khoản cũng ném đúng lỗi như mã sai — không tiết lộ
      // tài khoản nào có thật.
      if (!user) throw new OtpInvalidException();

      const valid = await this.otpStore.verify(
        PasswordResetPurpose,
        user.globalId,
        reset.otp.trim(),
      );

      if (!valid) throw new OtpInvalidException();
    } else {
      throw new OtpInvalidException();
    }

    const resetAt = new Date();

    // Thứ tự ở đây quan trọng, và không phải thứ tự trực giác.
    //
    // Ba lệnh ghi dưới đây KHÔNG nằm chung transaction (một trên Redis, hai
    // trên Postgres). Nên phải xếp sao cho tiến trình chết ở bất kỳ điểm nào
    // giữa chừng cũng không để lại trạng thái nguy hiểm. Đổi mật khẩu đứng
    // CUỐI: nếu nó chạy trước mà lệnh thu hồi phiên chưa kịp chạy, kẻ đang giữ
    // refresh token vẫn gọi /refresh lấy được access token mới — mà `refresh`
    // không có cách nào biết mật khẩu vừa đổi (nó chỉ kiểm `deletedAt` và
    // `BANNED`). Khi đó việc đặt lại mật khẩu chẳng đuổi được ai.
    //
    // Chết giữa chừng theo thứ tự này thì mật khẩu chưa đổi, phiên đã mất —
    // người dùng xin mã mới làm lại, không ai bị chiếm.

    // 1. Access token (JWT, không tra database nên phải chặn riêng).
    await this.denyList.revokeIssuedBefore(user.globalId);

    // 2. Refresh token. Người dùng đặt lại mật khẩu thường vì nghi bị chiếm
    //    tài khoản — để phiên của kẻ chiếm sống tiếp thì vô nghĩa.
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()', fcmToken: null })
      .where('user_id = :userId', { userId: user.globalId })
      .andWhere('revoked_at IS NULL')
      .execute();

    // 3. Mật khẩu mới.
    await this.userRepository.update(
      { globalId: user.globalId },
      { passwordHash: await this.passwordService.hash(reset.newPassword) },
    );

    return { resetAt, revokedSessions: result.affected ?? 0 };
  }
}
