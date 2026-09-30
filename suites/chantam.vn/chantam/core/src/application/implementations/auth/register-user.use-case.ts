import {
  IRegisterUserCommand,
  IRegisterUserResult,
  IRegisterUserUseCase,
} from '@/application/contracts/auth';
import { UsernameTakenException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IGroupRepository, IUserRepository } from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import { hashSignupFingerprint } from '@/infrastructure/security/signup-fingerprint';
import { UserId } from '@chantam.vn/chantam.core-lib/values';
import { IPasswordService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionIssuer } from './session-issuer';

@Injectable()
export class RegisterUserUseCase implements IRegisterUserUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    private readonly sessionIssuer: SessionIssuer,
    @Inject(IGroupRepository)
    private readonly groups: IGroupRepository,
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

    // Vào nhóm qua link mời (F54/BR-GRP-04). CHỈ ở đây, chỉ cho tài khoản vừa
    // tạo: membership không sinh ra từ đường nào khác, và chính ràng buộc đó là
    // hàng rào chặn việc một người nhảy vòng quanh các nhóm để gom affiliate.
    //
    // Mã sai hay nhóm đã giải tán thì BỎ QUA, không ném: tài khoản đã tạo xong
    // rồi, và bắt họ đăng ký lại vì một mã hỏng là phạt người dùng cho lỗi của
    // người gửi link.
    if (registration.inviteCode) {
      const invited = await this.groups.findActiveByInviteCode(
        registration.inviteCode.trim().toUpperCase(),
      );
      if (invited)
        await this.groups.addMember({
          globalId: randomUUID(),
          groupId: invited.groupId,
          userId: globalId,
        });
    }

    // Đăng ký xong tự đăng nhập luôn (F01).
    return this.sessionIssuer.issue(
      created.user,
      registration.deviceId,
      registration.fcmToken,
    );
  }
}
