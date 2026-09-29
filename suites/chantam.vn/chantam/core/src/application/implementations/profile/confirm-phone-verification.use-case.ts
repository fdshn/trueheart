import { IRecordOnboardingEvidenceUseCase } from '@/application/contracts/onboarding';
import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  IConfirmPhoneVerificationCommand,
  IConfirmPhoneVerificationUseCase,
} from '@/application/contracts/profile';
import {
  OtpInvalidException,
  PhoneAlreadyVerifiedException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IUserRepository,
  IVerifiedPhoneRepository,
} from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import { appendPointIgnoringPolicy } from '../point/point-policy-errors';
import { PhoneVerificationPurpose } from './request-phone-verification.use-case';

@Injectable()
export class ConfirmPhoneVerificationUseCase implements IConfirmPhoneVerificationUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IOtpStore) private readonly otp: IOtpStore,
    @Inject(IVerifiedPhoneRepository)
    private readonly verifiedPhones: IVerifiedPhoneRepository,
    @Inject(IRecordOnboardingEvidenceUseCase)
    private readonly recordOnboardingEvidenceUseCase: IRecordOnboardingEvidenceUseCase,
    @Inject(IAppendPointEntryUseCase)
    private readonly appendPointEntryUseCase: IAppendPointEntryUseCase,
  ) {}

  public async handle(command: IConfirmPhoneVerificationCommand) {
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

    // Ghi tên vào sổ số đã xác minh TRƯỚC khi đánh dấu và trước khi cộng điểm.
    //
    // Gỡ số khỏi hồ sơ và xoá tài khoản đều trả số lại cho người khác dùng, vì
    // phép kiểm trùng chỉ nhìn `users.phone` hiện tại. Không có sổ này thì một
    // SIM quay vòng vô hạn: xác minh, ăn 28đ, xong onboarding lấy 224đ, kích
    // hoạt thưởng giới thiệu, gỡ số, tạo tài khoản mới, lặp lại.
    const claim = await this.verifiedPhones.claim({
      phone: user.phone,
      userId: user.globalId,
    });

    if (claim === 'TAKEN') throw new PhoneAlreadyVerifiedException();

    const verifiedAt = new Date();

    await this.users.update(
      { globalId: user.globalId },
      { phoneVerifiedAt: verifiedAt },
    );

    await this.recordOnboardingEvidenceUseCase.handle({
      userId: user.globalId,
      evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
    });

    // Khoá chống trùng theo NGƯỜI. Sổ số đã xác minh lo phần còn lại: cùng một
    // SIM không mở được tài khoản thứ hai để mà cộng lần nữa.
    //
    // Thưởng trượt KHÔNG được làm hỏng việc xác minh. Tới đây `phoneVerifiedAt`
    // đã ghi và số đã vào sổ, nên ném ra ngoài là trả lỗi cho một việc đã thành
    // công — và bấm lại cũng vô ích vì `claim()` trả `ALREADY_OWN` rồi lại ném ở
    // đúng chỗ này. `reconcile-milestone-rewards` là đường vá cho phần điểm.
    await appendPointIgnoringPolicy(this.appendPointEntryUseCase, {
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
