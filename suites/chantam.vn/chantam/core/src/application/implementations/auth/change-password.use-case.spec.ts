import { InvalidCredentialsException } from '@/domain/exceptions';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { ChangePasswordUseCase } from './change-password.use-case';

const UserId = '11111111-1111-4111-8111-111111111111';

const Command = {
  userId: UserId,
  password: {
    currentPassword: 'MatKhauCu@123',
    newPassword: 'MatKhauMoi@456',
    confirmPassword: 'MatKhauMoi@456',
    deviceId: 'thiet-bi-1',
  },
};

function makeDeps(options: { matches?: boolean; user?: unknown } = {}) {
  const order: string[] = [];

  return {
    order,
    users: {
      findOneBy: jest.fn(async () =>
        options.user === undefined
          ? { globalId: UserId, passwordHash: 'cu', deletedAt: null }
          : options.user,
      ),
      update: jest.fn(async () => {
        order.push('password');
      }),
    },
    sessions: {
      createQueryBuilder: jest.fn(() => ({
        update: () => ({
          set: () => ({
            where: () => ({
              andWhere: () => ({
                execute: async () => {
                  order.push('sessions');

                  return { affected: 2 };
                },
              }),
            }),
          }),
        }),
      })),
    },
    passwords: {
      verify: jest.fn(async () => options.matches ?? true),
      hash: jest.fn(async () => 'moi'),
    },
    denyList: {
      revokeIssuedBefore: jest.fn(async () => {
        order.push('deny');
      }),
      isRevoked: jest.fn(),
    },
    issuer: {
      issue: jest.fn(async () => {
        order.push('issue');

        return { session: { accessToken: 'moi' }, user: { userId: UserId } };
      }),
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new ChangePasswordUseCase(
    deps.users as never,
    deps.sessions as never,
    deps.passwords as never,
    deps.denyList as never,
    deps.issuer as never,
  );
}

describe('ChangePasswordUseCase', () => {
  it('sai mật khẩu hiện tại thì KHÔNG đụng gì tới phiên', async () => {
    const deps = makeDeps({ matches: false });

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(deps.denyList.revokeIssuedBefore).not.toHaveBeenCalled();
    expect(deps.users.update).not.toHaveBeenCalled();
  });

  it('đặt lại đúng mật khẩu cũ thì từ chối', async () => {
    // Không chặn thì thao tác này thu hồi sạch phiên trên mọi thiết bị mà chẳng
    // đổi gì cả — công toi và gây hoang mang.
    const deps = makeDeps();

    await expect(
      makeUseCase(deps).handle({
        ...Command,
        password: {
          ...Command.password,
          newPassword: Command.password.currentPassword,
          confirmPassword: Command.password.currentPassword,
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.users.update).not.toHaveBeenCalled();
  });

  it('thu hồi token TRƯỚC rồi mới đổi mật khẩu', async () => {
    // Đổi trước mà thu hồi chưa kịp chạy thì kẻ đang giữ refresh token vẫn gọi
    // /refresh lấy được token mới — việc đổi mật khẩu chẳng đuổi được ai.
    const deps = makeDeps();

    await makeUseCase(deps).handle(Command);

    expect(deps.order).toEqual(['deny', 'sessions', 'password', 'issue']);
  });

  it('cấp lại phiên cho ĐÚNG thiết bị đang gọi', async () => {
    const deps = makeDeps();

    const result = await makeUseCase(deps).handle(Command);

    expect(deps.issuer.issue).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'moi' }),
      'thiet-bi-1',
      undefined,
    );
    expect(result.session.accessToken).toBe('moi');
  });

  it('tài khoản đã xoá thì không đổi được', async () => {
    const deps = makeDeps({
      user: { globalId: UserId, passwordHash: 'cu', deletedAt: new Date() },
    });

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });
});
