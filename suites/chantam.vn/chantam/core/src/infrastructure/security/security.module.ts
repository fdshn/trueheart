import {
  IHtmlSanitizer,
  ILoginThrottle,
  IOtpStore,
  IRequestThrottle,
  ISecretCipher,
} from '@/domain/ports/security';
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AesSecretCipher } from './aes-secret-cipher';
import { GlobalRateLimitGuard } from './global-rate-limit.guard';
import { LoginThrottle } from './login-throttle';
import { OtpStore } from './otp-store';
import { RequestThrottle } from './request-throttle';
import { SanitizeHtmlSanitizer } from './sanitize-html.sanitizer';

@Global()
@Module({
  providers: [
    { provide: IHtmlSanitizer, useClass: SanitizeHtmlSanitizer },
    { provide: ILoginThrottle, useClass: LoginThrottle },
    { provide: IOtpStore, useClass: OtpStore },
    { provide: IRequestThrottle, useClass: RequestThrottle },
    { provide: ISecretCipher, useClass: AesSecretCipher },
    // Đăng ký ở ĐÂY chứ không ở `AppModule`: guard cần `IRequestThrottle`, và
    // module này là chỗ provider đó sống. Đặt ở `AppModule` thì phải import
    // `SecurityModule` vào đó — mà nó đã `@Global()`, nên hai đường cùng đích.
    //
    // `APP_GUARD` áp cho MỌI route, kể cả route thêm sau này. Đó chính là điểm:
    // những trần theo hành vi phải được gọi ở từng chỗ, nên một endpoint mới quên
    // gọi thì không có gì đỡ.
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
  exports: [
    IHtmlSanitizer,
    ILoginThrottle,
    IOtpStore,
    IRequestThrottle,
    ISecretCipher,
  ],
})
export class SecurityModule {}
