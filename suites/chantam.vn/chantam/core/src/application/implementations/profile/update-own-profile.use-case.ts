import { IRecordOnboardingEvidenceUseCase } from '@/application/contracts/onboarding';
import {
  IUpdateOwnProfileCommand,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import {
  EmailTakenException,
  PhoneTakenException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  isProfileComplete,
  normalizePhoneNumber,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { toOwnProfileDto } from './profile.mapper';

@Injectable()
export class UpdateOwnProfileUseCase implements IUpdateOwnProfileUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
    @Inject(IRecordOnboardingEvidenceUseCase)
    private readonly recordOnboardingEvidenceUseCase: IRecordOnboardingEvidenceUseCase,
  ) {}

  public async handle(command: IUpdateOwnProfileCommand) {
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });

    if (!user || user.deletedAt) throw new UserNotFoundException();

    const update: Record<string, unknown> = {};
    const { profile: profileUpdate } = command;

    if (profileUpdate.fullName !== undefined)
      update.fullName = profileUpdate.fullName
        ? profileUpdate.fullName.trim()
        : null;

    if (profileUpdate.avatarKey !== undefined) {
      update.avatarUrl = profileUpdate.avatarKey
        ? await this.confirmAvatar(user.globalId, profileUpdate.avatarKey)
        : null;
    }

    if (profileUpdate.email !== undefined) {
      const email = profileUpdate.email
        ? profileUpdate.email.trim().toLowerCase()
        : null;
      if (
        email &&
        email !== user.email &&
        (await this.userRepository.isEmailTaken(email, user.globalId))
      )
        throw new EmailTakenException();
      update.email = email;

      // Đổi email đồng nghĩa bằng chứng sở hữu địa chỉ cũ không còn giá trị.
      // Thiếu dòng này thì xác minh một địa chỉ của mình rồi đổi sang địa chỉ
      // người khác là giữ nguyên dấu "đã xác minh" — và dấu đó chính là thứ mở
      // đường đặt lại mật khẩu.
      if (email !== user.email) update.emailVerifiedAt = null;
    }
    if (profileUpdate.defaultLocation !== undefined)
      update.defaultLocation = profileUpdate.defaultLocation;

    if (profileUpdate.phone !== undefined) {
      // Nắn về E.164 TRƯỚC khi so trùng và trước khi lưu. Index UNIQUE so
      // chuỗi, nên `0912345678` và `+84912345678` từng là hai tài khoản hợp lệ
      // cho cùng một SIM.
      const phone = profileUpdate.phone
        ? normalizePhoneNumber(profileUpdate.phone)
        : null;

      if (profileUpdate.phone && !phone)
        throw new ValidationFailedException([
          'phone: số điện thoại không hợp lệ',
        ]);

      if (
        phone &&
        phone !== user.phone &&
        (await this.userRepository.isPhoneTaken(phone, user.globalId))
      )
        throw new PhoneTakenException();
      update.phone = phone;

      // Đổi SĐT đồng nghĩa bằng chứng sở hữu SĐT cũ không còn giá trị.
      if (phone !== user.phone) update.phoneVerifiedAt = null;
    }

    await this.userRepository.update({ globalId: command.userId }, update);

    const profile = await this.userRepository.findOneByOrFail({
      globalId: command.userId,
    });
    if (isProfileComplete(profile)) {
      await this.recordOnboardingEvidenceUseCase.handle({
        userId: command.userId,
        evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
      });
    }

    return { profile: toOwnProfileDto(profile) };
  }

  /**
   * Đổi lỗi thô của tầng lưu trữ thành lỗi nghiệp vụ đọc được.
   *
   * `confirmAvatarUpload` ném `Error` trần khi key không thuộc tài khoản, không
   * phải ảnh, hoặc quá nặng — và `Error` trần đi thẳng thành 500. Người dùng gõ
   * nhầm một key nhận "lỗi hệ thống" thay vì "key không hợp lệ".
   */
  private async confirmAvatar(userId: string, key: string): Promise<string> {
    try {
      return await this.storage.confirmAvatarUpload(userId, key);
    } catch (error) {
      throw new ValidationFailedException([
        `avatarKey: ${error instanceof Error ? error.message : 'không dùng được'}`,
      ]);
    }
  }
}
