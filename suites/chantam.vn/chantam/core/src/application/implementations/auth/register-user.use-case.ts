import {
  IRegisterUserCommand,
  IRegisterUserResult,
  IRegisterUserUseCase,
} from '@/application/contracts/auth';
import { UsernameTakenException } from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
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

    const created = await this.userRepository.createWithReferral({
      globalId,
      username,
      passwordHash: await this.passwordService.hash(registration.password),
      referralCode: registration.referralCode,
    });
    if (!created.user) throw new UsernameTakenException(username);

    // Đăng ký xong tự đăng nhập luôn (F01).
    return this.sessionIssuer.issue(
      created.user,
      registration.deviceId,
      registration.fcmToken,
    );
  }
}
