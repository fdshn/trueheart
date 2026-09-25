import { InvalidCredentialsException } from '@/domain/exceptions';
import { LoginUserUseCase } from './login-user.use-case';

const Command = {
  credentials: {
    identifier: 'nguoidung01',
    password: 'MatKhau@123',
    deviceId: 'thiet-bi-1',
  },
  clientIp: '203.0.113.7',
};

function makeDeps(user: unknown) {
  return {
    userRepository: { findByIdentifier: jest.fn(async () => user) },
    passwordService: { verify: jest.fn(async () => false), hash: jest.fn() },
    throttle: {
      assertNotLocked: jest.fn(async () => undefined),
      registerFailure: jest.fn(async () => undefined),
      reset: jest.fn(async () => undefined),
    },
    sessionIssuer: { issue: jest.fn() },
    requestThrottle: {
      assertWithinLimit: jest.fn(async () => undefined),
      registerHit: jest.fn(async () => undefined),
    },
    config: {
      auth: { maxLoginAttemptsPerIp: 30, loginLockSeconds: 900 },
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new LoginUserUseCase(
    deps.userRepository as never,
    deps.passwordService as never,
    deps.throttle as never,
    deps.requestThrottle as never,
    deps.config as never,
    deps.sessionIssuer as never,
  );
}

describe('LoginUserUseCase — chống dò tài khoản', () => {
  it('vẫn chạy bcrypt khi tài khoản không tồn tại', async () => {
    // Không chạy thì đăng nhập bằng username lạ trả lời sau vài mili giây, còn
    // username có thật mất hàng trăm mili giây — chênh lệch đó là một kênh dò.
    const deps = makeDeps(null);

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(deps.passwordService.verify).toHaveBeenCalledTimes(1);
  });

  it('đếm lần sai CẢ KHI tài khoản không tồn tại', async () => {
    // Nếu chỉ đếm cho tài khoản có thật thì lỗi 429 LOGIN_THROTTLED trở thành
    // câu trả lời cho "username này có tồn tại không" — đúng thứ mà mã lỗi
    // dùng chung với INVALID_CREDENTIALS trước đây vô tình che được.
    const deps = makeDeps(null);

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();
    expect(deps.throttle.registerFailure).toHaveBeenCalledWith('nguoidung01');
  });

  it('kiểm khoá TRƯỚC khi tra database', async () => {
    const deps = makeDeps(null);
    const order: string[] = [];

    deps.throttle.assertNotLocked.mockImplementation(async () => {
      order.push('throttle');
    });
    deps.userRepository.findByIdentifier.mockImplementation(async () => {
      order.push('database');

      return null;
    });

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();
    expect(order).toEqual(['throttle', 'database']);
  });

  it('cắt khoảng trắng thừa ở định danh trước khi đếm', async () => {
    const deps = makeDeps(null);

    await expect(
      makeUseCase(deps).handle({
        credentials: { ...Command.credentials, identifier: '  nguoidung01  ' },
        clientIp: Command.clientIp,
      }),
    ).rejects.toThrow();

    // Không cắt thì thêm một dấu cách là vượt được bộ đếm.
    expect(deps.throttle.registerFailure).toHaveBeenCalledWith('nguoidung01');
  });

  it('có trần thứ hai theo NGUỒN GỌI, và chỉ đếm khi sai', async () => {
    // Trần theo tài khoản không chặn được người rải một mật khẩu phổ biến qua
    // hàng nghìn username: mỗi tài khoản chỉ sai một lần.
    const deps = makeDeps(null);

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();

    expect(deps.requestThrottle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'login-ip',
      key: '203.0.113.7',
      limit: 30,
    });
    expect(deps.requestThrottle.registerHit).toHaveBeenCalledWith({
      bucket: 'login-ip',
      key: '203.0.113.7',
      windowSeconds: 900,
    });
  });

  it('đăng nhập ĐÚNG thì không đếm vào trần theo IP', async () => {
    // Đếm cả lần đúng thì một văn phòng chung IP tự khoá nhau chỉ vì dùng app
    // bình thường.
    const deps = makeDeps({
      globalId: 'u1',
      status: 'ACTIVE',
      passwordHash: 'x',
    });
    deps.passwordService.verify.mockResolvedValue(true);

    await makeUseCase(deps).handle(Command);

    expect(deps.requestThrottle.registerHit).not.toHaveBeenCalled();
  });
});
