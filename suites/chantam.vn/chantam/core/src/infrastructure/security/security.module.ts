import { ILoginThrottle, IOtpStore } from '@/domain/ports/security';
import { Global, Module } from '@nestjs/common';
import { LoginThrottle } from './login-throttle';
import { OtpStore } from './otp-store';

@Global()
@Module({
  providers: [
    { provide: ILoginThrottle, useClass: LoginThrottle },
    { provide: IOtpStore, useClass: OtpStore },
  ],
  exports: [ILoginThrottle, IOtpStore],
})
export class SecurityModule {}
