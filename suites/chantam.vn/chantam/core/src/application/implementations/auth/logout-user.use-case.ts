import {
  ILogoutUserCommand,
  ILogoutUserResult,
  ILogoutUserUseCase,
} from '@/application/contracts/auth';
import { IUserSessionRepository } from '@/domain/ports/repository';
import { ITokenService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class LogoutUserUseCase implements ILogoutUserUseCase {
  public constructor(
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(ITokenService)
    private readonly tokenService: ITokenService,
  ) {}

  public async handle(command: ILogoutUserCommand): Promise<ILogoutUserResult> {
    const hash = this.tokenService.hashRefreshToken(
      command.session.refreshToken,
    );

    const session = await this.sessionRepository.findActiveByTokenHash(hash);
    const loggedOutAt = new Date();

    // Token không còn hiệu lực thì coi như đã đăng xuất, trả về thành công.
    // Đăng xuất phải luôn thành công — báo lỗi chỉ làm client kẹt ở trạng thái
    // nửa vời, còn người dùng thì vẫn nghĩ mình đã thoát.
    if (!session) return { loggedOutAt };

    // Chỉ chủ phiên mới thu hồi được phiên đó. Thiếu phép kiểm này thì ai cầm
    // refresh token của người khác cũng đá họ ra được.
    if (session.userId !== command.userId) return { loggedOutAt };

    await this.sessionRepository.update(
      { id: session.id },
      // Xoá luôn FCM token (F04): máy đã đăng xuất không được nhận thông báo nữa.
      { revokedAt: loggedOutAt, fcmToken: null },
    );

    return { loggedOutAt };
  }
}
