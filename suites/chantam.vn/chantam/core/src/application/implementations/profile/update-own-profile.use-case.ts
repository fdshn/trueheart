import {
  LeaderboardClock,
  LeaderboardClockFn,
} from '@/application/contracts/leaderboard';
import { IRecordOnboardingEvidenceUseCase } from '@/application/contracts/onboarding';
import {
  IUpdateOwnProfileCommand,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import {
  EmailAlreadyUsedException,
  InvalidEmailFormatException,
  PhoneTakenException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IPresenceStore } from '@/domain/ports/cache';
import { IUserRepository } from '@/domain/ports/repository';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  isProfileComplete,
  normalizePhoneNumber,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { withStorageValidation } from '../shared/storage-error';
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
    // Mốc `todayThoughtUpdatedAt` phải kiểm được bằng một thời điểm cố định.
    @Optional()
    @Inject(LeaderboardClock)
    private readonly now: LeaderboardClockFn = () => new Date(),
    @Optional()
    @Inject(IPresenceStore)
    private readonly presence?: IPresenceStore,
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
        ? await withStorageValidation('avatarKey', () =>
            this.storage.confirmAvatarUpload(
              user.globalId,
              profileUpdate.avatarKey as string,
            ),
          )
        : null;
    }

    if (profileUpdate.email !== undefined) {
      const email = profileUpdate.email
        ? profileUpdate.email.trim().toLowerCase()
        : null;
      // Kiểm ở đây chứ không ở DTO: DTO chỉ ra được VALIDATION_FAILED chung, còn mobile cần
      // INVALID_EMAIL_FORMAT riêng để báo đúng ô (PR #46 §5).
      if (email && !isEmail(email)) throw new InvalidEmailFormatException();
      if (
        email &&
        email !== user.email &&
        (await this.userRepository.isEmailTaken(email, user.globalId))
      )
        throw new EmailAlreadyUsedException();
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

    if (profileUpdate.leaderboardAnonymous !== undefined)
      update.leaderboardAnonymous = profileUpdate.leaderboardAnonymous;
    if (profileUpdate.showOnlineStatus !== undefined)
      update.showOnlineStatus = profileUpdate.showOnlineStatus;

    if (profileUpdate.slogan !== undefined)
      update.slogan = blankToNull(profileUpdate.slogan);
    if (profileUpdate.todayThought !== undefined) {
      const thought = blankToNull(profileUpdate.todayThought);
      // Gửi lại đúng chữ cũ (app lưu cả form) KHÔNG làm mới mốc: "cập nhật hôm nay" trên hồ sơ
      // phải nói về lần người ta thật sự đổi suy nghĩ.
      if (thought !== user.todayThought) {
        update.todayThought = thought;
        update.todayThoughtUpdatedAt = thought === null ? null : this.now();
      }
    }
    if (profileUpdate.emailVisibility !== undefined)
      update.emailVisibility = profileUpdate.emailVisibility;
    if (profileUpdate.phoneVisibility !== undefined)
      update.phoneVisibility = profileUpdate.phoneVisibility;

    // Clip giới thiệu: chỉ nhận KEY, xác nhận qua HeadObject rồi lưu URL — y như avatar.
    if (profileUpdate.introVideoKey === null) {
      // Gỡ clip thì gỡ luôn ảnh bìa: ảnh bìa không có clip là một ô hỏng trên hồ sơ.
      update.introVideoUrl = null;
      update.introVideoThumbnailUrl = null;
    } else if (profileUpdate.introVideoKey !== undefined) {
      update.introVideoUrl = await withStorageValidation(
        'profile.introVideoKey',
        () =>
          this.storage.confirmIntroVideoUpload(
            user.globalId,
            profileUpdate.introVideoKey as string,
          ),
      );
      // Clip MỚI mà không kèm ảnh bìa mới: ảnh bìa cũ là khung hình của clip khác, nên bỏ
      // nó đi. Kèm ảnh bìa thì khối dưới ghi đè.
      if (update.introVideoUrl !== user.introVideoUrl)
        update.introVideoThumbnailUrl = null;
    }
    if (
      profileUpdate.introVideoThumbnailKey !== undefined &&
      profileUpdate.introVideoKey !== null
    ) {
      if (profileUpdate.introVideoThumbnailKey === null)
        update.introVideoThumbnailUrl = null;
      else {
        if (!update.introVideoUrl && !user.introVideoUrl)
          throw new ValidationFailedException([
            'profile.introVideoThumbnailKey: hồ sơ chưa có clip giới thiệu',
          ]);
        update.introVideoThumbnailUrl = await withStorageValidation(
          'profile.introVideoThumbnailKey',
          () =>
            this.storage.confirmIntroThumbnailUpload(
              user.globalId,
              profileUpdate.introVideoThumbnailKey as string,
            ),
        );
      }
    }

    await this.userRepository.update({ globalId: command.userId }, update);

    // Tắt hiện trạng thái online phải có hiệu lực NGAY (PR #46 §10.5): xoá mọi session của
    // người này khỏi Redis, không chờ TTL 120 giây. Họ vẫn được đếm lại từ nhịp heartbeat sau,
    // nhưng không còn trong danh sách hiện danh tính.
    if (
      profileUpdate.showOnlineStatus === false &&
      user.showOnlineStatus === true
    )
      await this.presence?.clearUser(command.userId);

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

/** Chuỗi trắng cũng là "xoá": ô slogan chỉ có dấu cách không phải một slogan. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
