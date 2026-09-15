import {
  IRegisterUserCommand,
  IRegisterUserResult,
  IRegisterUserUseCase,
} from '@/application/contracts/auth';
import { UsernameTakenException } from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { UserId } from '@chantam.vn/chantam.core-lib/values';
import { IPasswordService } from '@chantam/service.auth-lib';
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
  ) {}

  public async handle(
    command: IRegisterUserCommand,
  ): Promise<IRegisterUserResult> {
    const { registration } = command;
    const username = registration.username.trim();

    if (await this.userRepository.isUsernameTaken(username))
      throw new UsernameTakenException(username);

    const globalId = UserId.create(username).toString();

    // `orIgnore` chứ không phải insert trần: giữa lúc kiểm trùng ở trên và lúc
    // ghi, một request song song có thể đã chiếm username. Ràng buộc duy nhất ở
    // database mới là chốt chặn thật; phép kiểm trên chỉ để có thông báo đẹp.
    const inserted = await this.userRepository
      .createQueryBuilder()
      .insert()
      .values({
        globalId,
        username,
        passwordHash: await this.passwordService.hash(registration.password),
        email: null,
        phone: null,
        fullName: null,
        avatarUrl: null,
        defaultLocation: null,
        rank: UserRanks.VIEWER,
        status: UserStatuses.ACTIVE,
        phoneVerifiedAt: null,
        suspendedUntil: null,
        deletedAt: null,
      })
      .orIgnore()
      .execute();

    if (inserted.identifiers.length === 0)
      throw new UsernameTakenException(username);

    const user = await this.userRepository.findOneByOrFail({ globalId });

    // Đăng ký xong tự đăng nhập luôn (F01).
    return this.sessionIssuer.issue(
      user,
      registration.deviceId,
      registration.fcmToken,
    );
  }
}
