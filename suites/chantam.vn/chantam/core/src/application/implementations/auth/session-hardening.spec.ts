import { UserSuspendedException } from '@/domain/exceptions';
import { LogoutUserUseCase } from './logout-user.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';

const UserId = '11111111-1111-4111-8111-111111111111';

describe('LogoutUserUseCase', () => {
  function makeDeps(session: unknown) {
    return {
      sessions: {
        findActiveByTokenHash: jest.fn(async () => session),
        update: jest.fn(async () => undefined),
      },
      tokens: { hashRefreshToken: jest.fn(() => 'bam') },
      denyList: {
        revokeIssuedBefore: jest.fn(async () => undefined),
        isRevoked: jest.fn(),
      },
    };
  }

  function makeUseCase(deps: ReturnType<typeof makeDeps>) {
    return new LogoutUserUseCase(
      deps.sessions as never,
      deps.tokens as never,
      deps.denyList as never,
    );
  }

  it('giết luôn access token, không chỉ thu hồi phiên', async () => {
    // Thiếu bước này thì bấm "Đăng xuất" xong token cũ vẫn gọi API được tới 15
    // phút — trên máy mượn thì đó đúng là khoảng thời gian người ta sợ.
    const deps = makeDeps({ id: 1, userId: UserId, deviceId: 'd1' });

    await makeUseCase(deps).handle({
      userId: UserId,
      session: { refreshToken: 'rt' },
    });

    expect(deps.sessions.update).toHaveBeenCalled();
    expect(deps.denyList.revokeIssuedBefore).toHaveBeenCalledWith(UserId);
  });

  it('refresh token của người KHÁC thì không thu hồi gì của họ', async () => {
    const deps = makeDeps({ id: 1, userId: 'nguoi-khac', deviceId: 'd1' });

    await makeUseCase(deps).handle({
      userId: UserId,
      session: { refreshToken: 'rt' },
    });

    expect(deps.sessions.update).not.toHaveBeenCalled();
    expect(deps.denyList.revokeIssuedBefore).not.toHaveBeenCalled();
  });
});

describe('RefreshSessionUseCase — trạng thái tài khoản', () => {
  function makeUseCase(user: unknown) {
    return new RefreshSessionUseCase(
      {
        findActiveByTokenHash: jest.fn(async () => ({
          userId: UserId,
          deviceId: 'd1',
          fcmToken: null,
        })),
      } as never,
      { findOneBy: jest.fn(async () => user) } as never,
      { hashRefreshToken: jest.fn(() => 'bam') } as never,
      { issue: jest.fn(async () => ({ session: {}, user: {} })) } as never,
    );
  }

  it('tài khoản đang bị treo thì KHÔNG gia hạn phiên được', async () => {
    // Đường treo hiện tại là Admin, mà Admin thì thu hồi sạch phiên — nhưng đó
    // là một giả định ngầm. Kiểm ở đây thì không phụ thuộc vào nó.
    const useCase = makeUseCase({
      globalId: UserId,
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() + 86_400_000),
      deletedAt: null,
    });

    await expect(
      useCase.handle({ session: { refreshToken: 'rt' } }),
    ).rejects.toBeInstanceOf(UserSuspendedException);
  });

  it('nhưng treo đã hết hạn thì cho đi tiếp, không chờ cron', async () => {
    const useCase = makeUseCase({
      globalId: UserId,
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() - 1_000),
      deletedAt: null,
    });

    await expect(
      useCase.handle({ session: { refreshToken: 'rt' } }),
    ).resolves.toBeDefined();
  });
});
