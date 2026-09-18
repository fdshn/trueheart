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
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
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
      update.fullName = profileUpdate.fullName;
    if (profileUpdate.avatarKey !== undefined)
      update.avatarUrl = await this.storage.confirmAvatarUpload(
        user.globalId,
        profileUpdate.avatarKey,
      );
    if (profileUpdate.email !== undefined) {
      const email = profileUpdate.email.trim().toLowerCase();
      if (
        email !== user.email &&
        (await this.userRepository.isEmailTaken(email, user.globalId))
      )
        throw new EmailTakenException();
      update.email = email;
    }
    if (profileUpdate.defaultLocation !== undefined)
      update.defaultLocation = profileUpdate.defaultLocation;

    if (profileUpdate.phone !== undefined) {
      const phone = profileUpdate.phone.trim();
      if (
        phone !== user.phone &&
        (await this.userRepository.isPhoneTaken(phone, user.globalId))
      )
        throw new PhoneTakenException();
      update.phone = phone;

      // Đổi SĐT đồng nghĩa bằng chứng sở hữu SĐT cũ không còn giá trị.
      if (profileUpdate.phone !== user.phone) update.phoneVerifiedAt = null;
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
}
