import { InvalidCredentialsException } from '@/domain/exceptions';
import { LoginUserUseCase } from './login-user.use-case';

const Command = {
  credentials: {
    identifier: 'nguoidung01',
    password: 'MatKhau@123',
    deviceId: 'thiet-bi-1',
  },
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
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new LoginUserUseCase(
    deps.userRepository as never,
    deps.passwordService as never,
    deps.throttle as never,
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
      }),
    ).rejects.toThrow();

    // Không cắt thì thêm một dấu cách là vượt được bộ đếm.
    expect(deps.throttle.registerFailure).toHaveBeenCalledWith('nguoidung01');
  });
});
