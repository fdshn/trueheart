import {
  ILoginThrottle,
  IOtpStore,
  ISecretCipher,
} from '@/domain/ports/security';
import { Global, Module } from '@nestjs/common';
import { AesSecretCipher } from './aes-secret-cipher';
import { LoginThrottle } from './login-throttle';
import { OtpStore } from './otp-store';

@Global()
@Module({
  providers: [
    { provide: ILoginThrottle, useClass: LoginThrottle },
    { provide: IOtpStore, useClass: OtpStore },
    { provide: ISecretCipher, useClass: AesSecretCipher },
  ],
  exports: [ILoginThrottle, IOtpStore, ISecretCipher],
})
export class SecurityModule {}
