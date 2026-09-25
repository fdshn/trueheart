import {
  IChangePasswordCommand,
  IChangePasswordResult,
  IChangePasswordUseCase,
} from '@/application/contracts/auth';
import { InvalidCredentialsException } from '@/domain/exceptions';
import {
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { IPasswordService, ITokenDenyList } from '@chantam/service.auth-lib';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { SessionIssuer } from './session-issuer';

/**
 * Đổi mật khẩu khi đang đăng nhập.
 *
 * Khác luồng quên mật khẩu ở chỗ không cần OTP — người gọi đã chứng minh mình
 * là chủ bằng access token CỘNG mật khẩu cũ. Và nó là đường DUY NHẤT để một tài
 * khoản chưa gắn email/SĐT đổi được mật khẩu: luồng quên mật khẩu của những tài
 * khoản đó rơi về `ADMIN_SUPPORT`, tức không đi tới đâu.
 */
@Injectable()
export class ChangePasswordUseCase implements IChangePasswordUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  public async handle(
    command: IChangePasswordCommand,
  ): Promise<IChangePasswordResult> {
    const { password } = command;
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });

    if (!user || user.deletedAt) throw new InvalidCredentialsException();

    const matches = await this.passwordService.verify(
      password.currentPassword,
      user.passwordHash,
    );

    // Cùng một lỗi cho "không có tài khoản" và "sai mật khẩu cũ" — nhưng ở đây
    // người gọi đã có token hợp lệ nên chuyện lộ thông tin không đáng lo; dùng
    // chung lỗi chỉ để client xử lý một nhánh.
    if (!matches) throw new InvalidCredentialsException();

    // Đặt lại đúng mật khẩu cũ thì không có gì thay đổi, mà lại thu hồi sạch
    // phiên trên mọi thiết bị — công toi và gây hoang mang.
    if (password.newPassword === password.currentPassword)
      throw new ValidationFailedException([
        'password.newPassword: mật khẩu mới phải khác mật khẩu hiện tại',
      ]);

    // Thứ tự y như luồng đặt lại mật khẩu, và vì cùng một lý do: ba lệnh ghi
    // dưới đây KHÔNG chung transaction (một trên Redis, hai trên Postgres).
    // Đổi mật khẩu đứng CUỐI — nếu nó chạy trước mà lệnh thu hồi chưa kịp chạy,
    // kẻ đang giữ refresh token vẫn gọi `/refresh` lấy được token mới.

    // 1. Access token (JWT, không tra database nên phải chặn riêng).
    await this.denyList.revokeIssuedBefore(user.globalId);

    // 2. Refresh token trên MỌI thiết bị. Đổi mật khẩu thường đi kèm nghi ngờ
    //    bị chiếm tài khoản; chừa lại một phiên nào đó là chừa lại đúng phiên
    //    mình muốn đuổi.
    const revoked = await this.sessionRepository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()', fcmToken: null })
      .where('user_id = :userId', { userId: user.globalId })
      .andWhere('revoked_at IS NULL')
      .execute();
    void revoked;

    // 3. Mật khẩu mới.
    const passwordHash = await this.passwordService.hash(password.newPassword);

    await this.userRepository.update(
      { globalId: user.globalId },
      { passwordHash },
    );

    // Cấp lại phiên cho chính thiết bị đang gọi. Không có bước này thì người
    // dùng vừa làm đúng một việc nên làm đã bị đá ra khỏi app.
    return this.sessionIssuer.issue(
      { ...user, passwordHash },
      password.deviceId,
      password.fcmToken,
    );
  }
}
