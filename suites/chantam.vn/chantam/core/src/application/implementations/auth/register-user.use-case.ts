import {
  IRegisterUserCommand,
  IRegisterUserResult,
  IRegisterUserUseCase,
} from '@/application/contracts/auth';
import { UsernameTakenException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IUserRepository } from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import { hashSignupFingerprint } from '@/infrastructure/security/signup-fingerprint';
import { UserId } from '@chantam.vn/chantam.core-lib/values';
import { IPasswordService } from '@chantam/service.auth-lib';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { SessionIssuer } from './session-issuer';

@Injectable()
export class RegisterUserUseCase implements IRegisterUserUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    private readonly sessionIssuer: SessionIssuer,
    @Inject(IRequestThrottle)
    private readonly requestThrottle: IRequestThrottle,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IRegisterUserCommand,
  ): Promise<IRegisterUserResult> {
    const { registration } = command;
    const username = registration.username.trim();

    // `inviteCode` (tên cũ, app đang dùng) và `groupInviteToken` (tên SRS 3.7A) là
    // MỘT trường. Hai giá trị khác nhau thì không đoán người dùng định vào nhóm nào.
    const [legacyCode, srsCode] = [
      registration.inviteCode,
      registration.groupInviteToken,
    ].map((code) => code?.trim().toUpperCase() || undefined);
    if (legacyCode && srsCode && legacyCode !== srsCode)
      throw new ValidationFailedException([
        'inviteCode và groupInviteToken là cùng một mã mời — gửi một trong hai',
      ]);
    const groupInviteCode = legacyCode ?? srsCode;

    // Trần theo nguồn gọi. Tài khoản mới ĐẺ RA ĐIỂM qua referral và affiliate,
    // nên tạo hàng loạt không chỉ là rác mà là một đường gian lận.
    await this.requestThrottle.assertWithinLimit({
      bucket: 'register-ip',
      key: command.clientIp,
      limit: this.config.auth.maxRegistrationsPerIp,
    });

    if (await this.userRepository.isUsernameTaken(username))
      throw new UsernameTakenException(username);

    const globalId = UserId.create(username).toString();

    const created = await this.userRepository.createWithReferral({
      globalId,
      username,
      passwordHash: await this.passwordService.hash(registration.password),
      referralCode: registration.referralCode,
      // Referral và mã mời nhóm kiểm ĐỘC LẬP: referral sai thì vẫn đăng ký (không
      // để lộ mã nào có thật), mã mời sai thì không — xem repository.
      groupInviteCode,
      // Dấu vết đăng ký, ghi cùng lúc tạo quan hệ giới thiệu. Trigger coi hai cột
      // này là bất biến, nên đây là lần duy nhất ghi được.
      //
      // `deviceId` do client tự sinh nên nó là tín hiệu YẾU: ai muốn lách thì đổi
      // mỗi lần. Giữ vì phần lớn người tạo tài khoản hàng loạt không lách — và một
      // tín hiệu yếu vẫn hơn không có tín hiệu nào, miễn là không ai tự động khoá
      // tài khoản dựa vào nó.
      signupIpHash: hashSignupFingerprint(
        'IP',
        command.clientIp,
        this.config.security.phoneHashPepper,
      ),
      signupDeviceHash: hashSignupFingerprint(
        'DEVICE',
        registration.deviceId,
        this.config.security.phoneHashPepper,
      ),
    });
    if (!created.user) throw new UsernameTakenException(username);

    // Đếm khi TẠO ĐƯỢC, không đếm lần gõ hỏng form: thứ cần giới hạn là số tài
    // khoản sinh ra, không phải số lần người ta gõ sai mật khẩu xác nhận.
    await this.requestThrottle.registerHit({
      bucket: 'register-ip',
      key: command.clientIp,
      windowSeconds: this.config.auth.registrationWindowSeconds,
    });

    // Đăng ký xong tự đăng nhập luôn (F01).
    return this.sessionIssuer.issue(
      created.user,
      registration.deviceId,
      registration.fcmToken,
    );
  }
}
