import { IModuleAsyncOptions } from '@chantam/service.common-lib/modules';
import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IPasswordService, ITokenDenyList, ITokenService } from '../contracts';
import { JwtAuthGuard } from '../guards';
import { IAuthOptions } from './auth-options';
import { NoopTokenDenyList } from './noop-token-deny-list';
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
  /** Mặc định `['/health']`. */
  publicPathPrefixes?: readonly string[];
}

/**
 * Nơi lưu danh sách thu hồi access token. Khai riêng chứ không nhét vào
 * `IAuthModuleOptions` vì nó cần `imports`/`inject` của chính nó — auth-lib
 * không được biết service dùng Redis hay thứ gì khác.
 *
 * Bỏ trống thì chạy bản rỗng và kêu cảnh báo lúc khởi động.
 */
export interface ITokenDenyListProvider {
  imports?: IModuleAsyncOptions<unknown>['imports'];
  inject?: IModuleAsyncOptions<unknown>['inject'];
  useFactory: (...args: any[]) => ITokenDenyList | Promise<ITokenDenyList>;
}

@Module({})
export class AuthModule {
  public static forRootAsync(
    options: IModuleAsyncOptions<IAuthModuleOptions> & {
      denyList?: ITokenDenyListProvider;
    },
  ): DynamicModule {
    const { denyList } = options;

    return {
      global: true,
      module: AuthModule,
      imports: [
        ...(options.imports ?? []),
        ...(denyList?.imports ?? []),
        JwtModule,
      ],
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
              publicPathPrefixes: resolved.publicPathPrefixes ?? ['/health'],
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
        denyList
          ? {
              provide: ITokenDenyList,
              inject: denyList.inject,
              useFactory: denyList.useFactory,
            }
          : { provide: ITokenDenyList, useClass: NoopTokenDenyList },
        // Guard toàn cục: mặc định khoá, mở từng endpoint bằng @Public().
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
      exports: [ITokenService, IPasswordService, ITokenDenyList, IAuthOptions],
    };
  }
}
