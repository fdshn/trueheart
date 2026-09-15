import {
  IDeleteAccountCommand,
  IDeleteAccountResult,
  IDeleteAccountUseCase,
} from '@/application/contracts/auth';
import { InvalidCredentialsException } from '@/domain/exceptions';
import {
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IPasswordService, ITokenDenyList } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DeleteAccountUseCase implements IDeleteAccountUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(IPasswordService)
    private readonly passwordService: IPasswordService,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
  ) {}

  public async handle(
    command: IDeleteAccountCommand,
  ): Promise<IDeleteAccountResult> {
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });

    if (!user || user.deletedAt) throw new InvalidCredentialsException();

    // Bắt nhập lại mật khẩu: xoá tài khoản không hoàn tác được, và access token
    // có thể đang nằm trong tay người mượn máy.
    const matches = await this.passwordService.verify(
      command.account.password,
      user.passwordHash,
    );

    if (!matches) throw new InvalidCredentialsException();

    // TODO(M3): chặn xoá khi còn giao dịch dở dang (F06). Bảng `transactions`
    // chưa tồn tại, nên phép kiểm này chưa gắn được.
    // TODO(M5): Owner xoá tài khoản thì Group phải giải tán (F55).

    const deletedAt = new Date();

    // Giết access token trước khi xoá dữ liệu — kể cả cái vừa dùng để gọi
    // chính endpoint này. Redis chết thì dừng ở đây, chưa xoá gì.
    await this.denyList.revokeIssuedBefore(user.globalId);

    await this.userRepository.update(
      { globalId: user.globalId },
      {
        deletedAt,
        // Ẩn danh dữ liệu cá nhân, GIỮ NGUYÊN username.
        //
        // Username là biệt danh người dùng tự chọn, không phải dữ liệu định
        // danh bắt buộc — và giữ nó khiến người khác không đăng ký lại được cái
        // tên đó để mạo danh. Bài đăng và lịch sử giao dịch vẫn trỏ về đúng một
        // danh tính. Nếu Bên A yêu cầu xoá luôn username thì đó là đánh đổi lấy
        // rủi ro mạo danh, cần quyết định riêng.
        email: null,
        phone: null,
        fullName: null,
        avatarUrl: null,
        defaultLocation: null,
        phoneVerifiedAt: null,
        status: UserStatuses.BANNED,
      },
    );

    const result = await this.sessionRepository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()', fcmToken: null })
      .where('user_id = :userId', { userId: user.globalId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return { deletedAt, revokedSessions: result.affected ?? 0 };
  }
}
