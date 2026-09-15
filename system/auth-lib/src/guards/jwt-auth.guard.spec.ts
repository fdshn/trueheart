import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IAuthPrincipal, ITokenDenyList, ITokenService } from '../contracts';
import {
  TokenInvalidException,
  TokenMissingException,
  TokenRevokedException,
} from '../exceptions';
import { IAuthOptions } from '../internal/auth-options';
import { JwtAuthGuard } from './jwt-auth.guard';

const Principal: IAuthPrincipal = {
  userId: '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b',
  username: 'nguoi-dung',
  rank: 'MEMBER',
  status: 'ACTIVE',
  issuedAt: new Date('2026-09-15T10:00:00Z'),
};

const Options: IAuthOptions = {
  jwtSecret: 'x'.repeat(32),
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  bcryptRounds: 12,
  publicPathPrefixes: ['/health'],
};

/** Request giả gói trong ExecutionContext tối thiểu mà guard thực sự dùng. */
function makeContext(url: string, authorization?: string) {
  const request: {
    url: string;
    headers: Record<string, string>;
    user?: unknown;
  } = {
    url,
    headers: authorization ? { authorization } : {},
  };

  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext,
  };
}

function makeGuard(overrides: {
  principal?: IAuthPrincipal | Error;
  revoked?: boolean;
  isPublicRoute?: boolean;
}) {
  const tokenService = {
    verifyAccessToken: jest.fn(async () => {
      if (overrides.principal instanceof Error) throw overrides.principal;

      return overrides.principal ?? Principal;
    }),
  } as unknown as ITokenService;

  const denyList = {
    isRevoked: jest.fn(async () => overrides.revoked ?? false),
    revokeIssuedBefore: jest.fn(),
  } as unknown as ITokenDenyList;

  const reflector = {
    getAllAndOverride: () => overrides.isPublicRoute === true,
  } as unknown as Reflector;

  return {
    guard: new JwtAuthGuard(reflector, tokenService, denyList, Options),
    denyList,
  };
}

describe('JwtAuthGuard', () => {
  it('thiếu token thì chặn', async () => {
    const { guard } = makeGuard({});
    const { context } = makeContext('/api/auth/me');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      TokenMissingException,
    );
  });

  it('token hợp lệ thì cho qua và gắn danh tính vào request', async () => {
    const { guard } = makeGuard({});
    const { context, request } = makeContext('/api/auth/me', 'Bearer abc');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(Principal);
  });

  it('token đã bị thu hồi thì chặn, dù chữ ký còn hợp lệ', async () => {
    const { guard } = makeGuard({ revoked: true });
    const { context } = makeContext('/api/auth/me', 'Bearer abc');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      TokenRevokedException,
    );
  });

  it('token không có thời điểm phát hành thì TỪ CHỐI, không cho qua', async () => {
    // Không đối chiếu được với danh sách thu hồi nghĩa là không biết token còn
    // hiệu lực hay không — khi không biết thì câu trả lời an toàn là không.
    const { guard, denyList } = makeGuard({
      principal: { ...Principal, issuedAt: undefined },
    });
    const { context } = makeContext('/api/auth/me', 'Bearer abc');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      TokenInvalidException,
    );
    expect(denyList.isRevoked).not.toHaveBeenCalled();
  });

  it('đường dẫn công khai vẫn vào được khi token đã bị thu hồi, nhưng coi như khách', async () => {
    const { guard } = makeGuard({ revoked: true });
    const { context, request } = makeContext('/health', 'Bearer abc');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('route đánh dấu @Public vẫn đọc được danh tính khi token còn tốt', async () => {
    const { guard } = makeGuard({ isPublicRoute: true });
    const { context, request } = makeContext('/api/gift-posts', 'Bearer abc');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(Principal);
  });
});
