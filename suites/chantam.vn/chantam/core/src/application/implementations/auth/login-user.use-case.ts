import {
  ILoginUserCommand,
  ILoginUserResult,
  ILoginUserUseCase,
} from '@/application/contracts/auth';
import {
  InvalidCredentialsException,
  UserBannedException,
  UserSuspendedException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IUserRepository } from '@/domain/ports/repository';
import { ILoginThrottle, IRequestThrottle } from '@/domain/ports/security';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IPasswordService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';
import { SessionIssuer } from './session-issuer';

/**
 * Bản băm của một mật khẩu không ai biết, dùng khi tài khoản không tồn tại.
 *
 * Không có nó, đăng nhập bằng username lạ trả lời sau vài mili giây còn username
 * có thật mất hàng trăm mili giây vì phải chạy bcrypt — chênh lệch đó đủ để dò
 * ra tài khoản nào đang tồn tại trong hệ thống.
 */
const DummyPasswordHash =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3Qm1Kk9gvGCQ0T1YQxNPXWlRMSTS3Bq';

@Injectable()
export class LoginUserUseCase implements ILoginUserUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    @Inject(ILoginThrottle)
    private readonly loginThrottle: ILoginThrottle,
    @Inject(IRequestThrottle)
    private readonly requestThrottle: IRequestThrottle,
    @Inject(IConfig)
    private readonly config: IConfig,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  public async handle(command: ILoginUserCommand): Promise<ILoginUserResult> {
    const { credentials } = command;
    const identifier = credentials.identifier.trim();

    await this.loginThrottle.assertNotLocked(identifier);

    // Trần thứ hai, đếm theo NGUỒN GỌI. Trần theo tài khoản ở trên không chặn
    // được người rải một mật khẩu phổ biến qua hàng nghìn username: mỗi tài
    // khoản chỉ sai một lần nên không cái nào chạm trần của riêng nó.
    await this.requestThrottle.assertWithinLimit({
      bucket: 'login-ip',
      key: command.clientIp,
      limit: this.config.auth.maxLoginAttemptsPerIp,
    });

    const user = await this.userRepository.findByIdentifier(identifier);

    // Luôn chạy bcrypt kể cả khi không tìm thấy tài khoản — xem DummyPasswordHash.
    const passwordMatches = await this.passwordService.verify(
      credentials.password,
      user?.passwordHash ?? DummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      await this.loginThrottle.registerFailure(identifier);
      // Chỉ đếm khi SAI. Đếm cả lần đúng thì một quán cà phê hay một văn phòng
      // chung IP sẽ tự khoá nhau chỉ vì đăng nhập bình thường.
      await this.requestThrottle.registerHit({
        bucket: 'login-ip',
        key: command.clientIp,
        windowSeconds: this.config.auth.loginLockSeconds,
      });

      throw new InvalidCredentialsException();
    }

    this.assertCanSignIn(user);

    await this.loginThrottle.reset(identifier);

    return this.sessionIssuer.issue(
      user,
      credentials.deviceId,
      credentials.fcmToken,
    );
  }

  private assertCanSignIn(user: IUserEntity): void {
    if (user.status === UserStatuses.BANNED) throw new UserBannedException();

    if (user.status !== UserStatuses.SUSPENDED) return;

    // Treo có thời hạn: hết hạn rồi thì cho vào bình thường. Việc đưa status về
    // ACTIVE do cron làm, nhưng đăng nhập không được chờ cron chạy.
    if (user.suspendedUntil && user.suspendedUntil <= new Date()) return;

    throw new UserSuspendedException(user.suspendedUntil);
  }
}
