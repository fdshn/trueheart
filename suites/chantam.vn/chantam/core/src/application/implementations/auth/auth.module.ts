import {
  IConfirmPasswordResetUseCase,
  IDeleteAccountUseCase,
  ILoginUserUseCase,
  ILogoutUserUseCase,
  IRefreshSessionUseCase,
  IRegisterUserUseCase,
  IRequestPasswordResetUseCase,
} from '@/application/contracts/auth';
import { Global, Module } from '@nestjs/common';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';
import { DeleteAccountUseCase } from './delete-account.use-case';
import { LoginUserUseCase } from './login-user.use-case';
import { LogoutUserUseCase } from './logout-user.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { RegisterUserUseCase } from './register-user.use-case';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';
import { SessionIssuer } from './session-issuer';

/**
 * Tên có hậu tố `UseCase` để không đụng `AuthModule` của `auth-lib` — hai thứ
 * khác nhau: một cái cấp token, một cái chứa nghiệp vụ đăng ký/đăng nhập.
 */
@Global()
@Module({
  providers: [
    SessionIssuer,
    { provide: IRegisterUserUseCase, useClass: RegisterUserUseCase },
    { provide: ILoginUserUseCase, useClass: LoginUserUseCase },
    { provide: IRefreshSessionUseCase, useClass: RefreshSessionUseCase },
    { provide: ILogoutUserUseCase, useClass: LogoutUserUseCase },
    {
      provide: IRequestPasswordResetUseCase,
      useClass: RequestPasswordResetUseCase,
    },
    {
      provide: IConfirmPasswordResetUseCase,
      useClass: ConfirmPasswordResetUseCase,
    },
    { provide: IDeleteAccountUseCase, useClass: DeleteAccountUseCase },
  ],
  exports: [
    IRegisterUserUseCase,
    ILoginUserUseCase,
    IRefreshSessionUseCase,
    ILogoutUserUseCase,
    IRequestPasswordResetUseCase,
    IConfirmPasswordResetUseCase,
    IDeleteAccountUseCase,
  ],
})
export class AuthUseCaseModule {}
