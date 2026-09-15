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
import { IUserRepository } from '@/domain/ports/repository';
import { ILoginThrottle } from '@/domain/ports/security';
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
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  public async handle(command: ILoginUserCommand): Promise<ILoginUserResult> {
    const { credentials } = command;
    const identifier = credentials.identifier.trim();

    await this.loginThrottle.assertNotLocked(identifier);

    const user = await this.userRepository.findByIdentifier(identifier);

    // Luôn chạy bcrypt kể cả khi không tìm thấy tài khoản — xem DummyPasswordHash.
    const passwordMatches = await this.passwordService.verify(
      credentials.password,
      user?.passwordHash ?? DummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      await this.loginThrottle.registerFailure(identifier);

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
