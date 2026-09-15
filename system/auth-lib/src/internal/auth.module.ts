import { IModuleAsyncOptions } from '@chantam/service.common-lib/modules';
import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IPasswordService, ITokenService } from '../contracts';
import { JwtAuthGuard } from '../guards';
import { IAuthOptions } from './auth-options';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface IAuthModuleOptions {
  jwtSecret: string;
  /** Mặc định 900 (15 phút). */
  accessTtlSeconds?: number;
  /** Mặc định 2592000 (30 ngày). */
  refreshTtlSeconds?: number;
  /** Mặc định 12. */
  bcryptRounds?: number;
}

@Module({})
export class AuthModule {
  public static forRootAsync(
    options: IModuleAsyncOptions<IAuthModuleOptions>,
  ): DynamicModule {
    return {
      global: true,
      module: AuthModule,
      imports: [...(options.imports ?? []), JwtModule],
      providers: [
        {
          provide: IAuthOptions,
          inject: options.inject,
          useFactory: async (...args: any[]): Promise<IAuthOptions> => {
            const resolved = await options.useFactory(...args);

            if (!resolved.jwtSecret || resolved.jwtSecret.length < 32)
              throw new Error(
                'JWT_SECRET phải có tối thiểu 32 ký tự. Sinh bằng: openssl rand -base64 48',
              );

            return {
              jwtSecret: resolved.jwtSecret,
              accessTtlSeconds: resolved.accessTtlSeconds ?? 900,
              refreshTtlSeconds: resolved.refreshTtlSeconds ?? 2_592_000,
              bcryptRounds: resolved.bcryptRounds ?? 12,
            };
          },
        },
        {
          provide: JwtService,
          inject: [IAuthOptions],
          useFactory: (authOptions: IAuthOptions) =>
            new JwtService({ secret: authOptions.jwtSecret }),
        },
        { provide: ITokenService, useClass: TokenService },
        { provide: IPasswordService, useClass: PasswordService },
        // Guard toàn cục: mặc định khoá, mở từng endpoint bằng @Public().
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
      exports: [ITokenService, IPasswordService, IAuthOptions],
    };
  }
}
