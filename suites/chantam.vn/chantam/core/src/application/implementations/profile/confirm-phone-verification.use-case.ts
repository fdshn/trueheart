import {
  IConfirmPhoneVerificationCommand,
  IConfirmPhoneVerificationUseCase,
} from '@/application/contracts/profile';
import {
  OtpInvalidException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { Inject, Injectable } from '@nestjs/common';
import { PhoneVerificationPurpose } from './request-phone-verification.use-case';
@Injectable()
export class ConfirmPhoneVerificationUseCase implements IConfirmPhoneVerificationUseCase {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
  ) {}
  async handle(command: IConfirmPhoneVerificationCommand) {
    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt || !user.phone)
      throw new UserNotFoundException();
    if (
      !(await this.otp.verify(
        PhoneVerificationPurpose,
        `${user.globalId}:${user.phone}`,
        command.verification.otp,
      ))
    )
      throw new OtpInvalidException();
    const verifiedAt = new Date();
    await this.users.update(
      { globalId: user.globalId },
      { phoneVerifiedAt: verifiedAt },
    );
    return { verifiedAt };
  }
}
