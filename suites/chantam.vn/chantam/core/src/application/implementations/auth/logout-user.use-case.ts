import {
  ILogoutUserCommand,
  ILogoutUserResult,
  ILogoutUserUseCase,
} from '@/application/contracts/auth';
import { IUserSessionRepository } from '@/domain/ports/repository';
import { ITokenDenyList, ITokenService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class LogoutUserUseCase implements ILogoutUserUseCase {
  public constructor(
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(ITokenService)
    private readonly tokenService: ITokenService,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
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

    // Giết luôn access token. Thiếu bước này thì bấm "Đăng xuất" xong, token cũ
    // vẫn gọi API được tới 15 phút — trên máy mượn hay máy công cộng thì đó là
    // đúng khoảng thời gian người ta sợ.
    //
    // Danh sách chặn ghi theo TÀI KHOẢN chứ không theo thiết bị, nên thiết bị
    // khác của cùng người sẽ nhận một lần 401 rồi tự lấy token mới bằng refresh
    // token của nó — phiên của họ KHÔNG mất, chỉ tốn thêm một vòng gọi.
    await this.denyList.revokeIssuedBefore(command.userId);

    return { loggedOutAt };
  }
}
