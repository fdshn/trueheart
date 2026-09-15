import {
  IRefreshSessionCommand,
  IRefreshSessionResult,
  IRefreshSessionUseCase,
} from '@/application/contracts/auth';
import {
  RefreshTokenInvalidException,
  UserBannedException,
} from '@/domain/exceptions';
import {
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ITokenService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';
import { SessionIssuer } from './session-issuer';

@Injectable()
export class RefreshSessionUseCase implements IRefreshSessionUseCase {
  public constructor(
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenService)
    private readonly tokenService: ITokenService,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  public async handle(
    command: IRefreshSessionCommand,
  ): Promise<IRefreshSessionResult> {
    const hash = this.tokenService.hashRefreshToken(
      command.session.refreshToken,
    );

    const session = await this.sessionRepository.findActiveByTokenHash(hash);

    if (!session) throw new RefreshTokenInvalidException();

    const user = await this.userRepository.findOneBy({
      globalId: session.userId,
    });

    if (!user || user.deletedAt) throw new RefreshTokenInvalidException();

    // Kiểm trạng thái LẠI ở đây, không tin token cũ: người dùng có thể đã bị
    // khoá sau khi token được cấp. Không kiểm thì tài khoản bị ban vẫn tự gia
    // hạn phiên vô thời hạn.
    if (user.status === UserStatuses.BANNED) throw new UserBannedException();

    // Xoay vòng token: `issue` tự thu hồi mọi phiên cũ của thiết bị này, nên
    // token vừa dùng lập tức mất hiệu lực. Token bị đánh cắp chỉ dùng được một
    // lần, và lần dùng đó đá chủ thật ra ngoài — một tín hiệu nhìn thấy được.
    return this.sessionIssuer.issue(
      user,
      session.deviceId,
      session.fcmToken ?? undefined,
    );
  }
}
