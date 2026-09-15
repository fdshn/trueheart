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
import { IPasswordService, ITokenDenyList } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';
import { PasswordResetPurpose } from './request-password-reset.use-case';

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
  ) {}

  public async handle(
    command: IConfirmPasswordResetCommand,
  ): Promise<IConfirmPasswordResetResult> {
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

    const resetAt = new Date();

    // Thu hồi TRƯỚC khi đổi mật khẩu, không phải sau. Nếu Redis chết thì lệnh
    // này ném lỗi và chưa có gì thay đổi — người dùng xin mã mới rồi làm lại,
    // an toàn hơn là mật khẩu đã đổi nhưng token của kẻ chiếm vẫn sống.
    await this.denyList.revokeIssuedBefore(user.globalId);

    await this.userRepository.update(
      { globalId: user.globalId },
      { passwordHash: await this.passwordService.hash(reset.newPassword) },
    );

    // Đổi mật khẩu thì thu hồi TOÀN BỘ phiên. Người dùng đặt lại mật khẩu
    // thường vì nghi bị chiếm tài khoản — để phiên của kẻ chiếm sống tiếp thì
    // việc đặt lại mật khẩu chẳng giải quyết được gì.
    //
    // Bảng này giữ refresh token; access token đã chặn bằng `denyList` ở trên.
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()', fcmToken: null })
      .where('user_id = :userId', { userId: user.globalId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return { resetAt, revokedSessions: result.affected ?? 0 };
  }
}
