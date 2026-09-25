import {
  ILoginThrottle,
  IOtpStore,
  IRequestThrottle,
  ISecretCipher,
} from '@/domain/ports/security';
import { Global, Module } from '@nestjs/common';
import { AesSecretCipher } from './aes-secret-cipher';
import { LoginThrottle } from './login-throttle';
import { OtpStore } from './otp-store';
import { RequestThrottle } from './request-throttle';

@Global()
@Module({
  providers: [
    { provide: ILoginThrottle, useClass: LoginThrottle },
    { provide: IOtpStore, useClass: OtpStore },
    { provide: IRequestThrottle, useClass: RequestThrottle },
    { provide: ISecretCipher, useClass: AesSecretCipher },
  ],
  exports: [ILoginThrottle, IOtpStore, IRequestThrottle, ISecretCipher],
})
export class SecurityModule {}
