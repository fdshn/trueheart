import { IRecordOnboardingEvidenceUseCase } from '@/application/contracts/onboarding';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
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
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import { PhoneVerificationPurpose } from './request-phone-verification.use-case';
@Injectable()
export class ConfirmPhoneVerificationUseCase implements IConfirmPhoneVerificationUseCase {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
    @Inject(IRecordOnboardingEvidenceUseCase)
    private readonly recordOnboardingEvidenceUseCase: IRecordOnboardingEvidenceUseCase,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
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
    await this.recordOnboardingEvidenceUseCase.handle({
      userId: user.globalId,
      evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
    });
    await this.appendPointEntryUseCase.handle({
      userId: user.globalId,
      ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
      referenceType: 'PHONE_VERIFICATION',
      referenceId: user.globalId,
      idempotencyKey: `PHONE_VERIFIED_FIRST_TIME:${user.globalId}`,
      actor: 'SYSTEM',
      source: 'PROFILE',
    });
    return { verifiedAt };
  }
}
