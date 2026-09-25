import {
  IConfirmEmailVerificationCommand,
  IConfirmEmailVerificationResult,
  IConfirmEmailVerificationUseCase,
  IRequestEmailVerificationCommand,
  IRequestEmailVerificationResult,
  IRequestEmailVerificationUseCase,
} from '@/application/contracts/profile';
import {
  OtpInvalidException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IOtpSender } from '@/domain/ports/notification';
import { IUserRepository } from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { NotImplementedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

export const EmailVerificationPurpose = 'email-verification';

/** Che thành `ngu***@gmail.com` — đủ để chủ nhận ra, không đủ để người lạ đọc. */
export function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@');

  if (!domain) return '***';

  return `${local.slice(0, 3)}***@${domain}`;
}

/**
 * Chủ thể của mã: gắn CẢ địa chỉ email vào khoá.
 *
 * Đổi email giữa lúc xin mã và lúc xác nhận thì mã cũ không mở được địa chỉ
 * mới — nếu chỉ khoá theo `userId`, người ta xin mã cho địa chỉ mình đọc được
 * rồi đổi sang địa chỉ người khác và xác nhận bằng mã cũ.
 */
function subjectOf(user: IUserEntity): string {
  return `${user.globalId}:${user.email ?? ''}`;
}

@Injectable()
export class RequestEmailVerificationUseCase implements IRequestEmailVerificationUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
    @Inject(IOtpSender) private readonly sender: IOtpSender,
  ) {}

  public async handle(
    command: IRequestEmailVerificationCommand,
  ): Promise<IRequestEmailVerificationResult> {
    const user = await this.users.findOneBy({ globalId: command.userId });

    if (!user || user.deletedAt || !user.email)
      throw new UserNotFoundException();

    if (!(await this.sender.canSend(PasswordResetChannels.EMAIL)))
      throw new NotImplementedException('Kênh email chưa được cấu hình');

    const result = await this.otp.issue(
      EmailVerificationPurpose,
      subjectOf(user),
    );

    await this.sender.send(
      PasswordResetChannels.EMAIL,
      user.email,
      result.code,
    );

    return {
      maskedEmail: maskEmailAddress(user.email),
      expiresInSeconds: result.expiresInSeconds,
    };
  }
}

@Injectable()
export class ConfirmEmailVerificationUseCase implements IConfirmEmailVerificationUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
  ) {}

  public async handle(
    command: IConfirmEmailVerificationCommand,
  ): Promise<IConfirmEmailVerificationResult> {
    const user = await this.users.findOneBy({ globalId: command.userId });

    if (!user || user.deletedAt || !user.email)
      throw new UserNotFoundException();

    if (
      !(await this.otp.verify(
        EmailVerificationPurpose,
        subjectOf(user),
        command.verification.otp,
      ))
    )
      throw new OtpInvalidException();

    const verifiedAt = new Date();

    await this.users.update(
      { globalId: user.globalId },
      { emailVerifiedAt: verifiedAt },
    );

    // KHÔNG cộng điểm và KHÔNG ghi bằng chứng onboarding. Xác minh SĐT có
    // thưởng vì nó là một mục trong danh sách onboarding đã chốt; thêm một
    // khoản thưởng mới ở đây là tự đặt ra luật kinh tế mà chưa ai duyệt.
    return { verifiedAt };
  }
}
