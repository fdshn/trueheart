import {
  IRequestPhoneVerificationCommand,
  IRequestPhoneVerificationUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import { IOtpSender } from '@/domain/ports/notification';
import { IUserRepository } from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { NotImplementedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
export const PhoneVerificationPurpose = 'phone-verification';
@Injectable()
export class RequestPhoneVerificationUseCase implements IRequestPhoneVerificationUseCase {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
    @Inject(IOtpSender) private readonly sender: IOtpSender,
  ) {}
  async handle(command: IRequestPhoneVerificationCommand) {
    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt || !user.phone)
      throw new UserNotFoundException();
    if (!(await this.sender.canSend(PasswordResetChannels.SMS)))
      throw new NotImplementedException('SMS provider chưa được cấu hình');
    const result = await this.otp.issue(
      PhoneVerificationPurpose,
      `${user.globalId}:${user.phone}`,
    );
    await this.sender.send(PasswordResetChannels.SMS, user.phone, result.code);
    return { expiresInSeconds: result.expiresInSeconds };
  }
}
