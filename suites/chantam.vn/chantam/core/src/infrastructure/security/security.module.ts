import { ILoginThrottle } from '@/domain/ports/security';
import { Global, Module } from '@nestjs/common';
import { LoginThrottle } from './login-throttle';

@Global()
@Module({
  providers: [{ provide: ILoginThrottle, useClass: LoginThrottle }],
  exports: [ILoginThrottle],
})
export class SecurityModule {}
