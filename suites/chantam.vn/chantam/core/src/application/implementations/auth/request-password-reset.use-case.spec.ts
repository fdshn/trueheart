import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

const Command = { reset: { identifier: 'nguoidung01' } };

const User = {
  globalId: '11111111-1111-1111-1111-111111111111',
  email: 'nguoidung01@example.com',
  phone: null,
  status: 'ACTIVE',
};

function makeDeps(options: {
  user?: unknown;
  senderConfigured?: boolean;
  sendableChannels?: PasswordResetChannels[];
}) {
  const sendable =
    options.sendableChannels ??
    ((options.senderConfigured ?? true)
      ? [PasswordResetChannels.EMAIL, PasswordResetChannels.SMS]
      : []);

  return {
    userRepository: {
      findByIdentifier: jest.fn(async () => options.user ?? null),
    },
    otpStore: {
      issue: jest.fn(async () => ({ code: '123456', expiresInSeconds: 300 })),
      verify: jest.fn(),
    },
    otpSender: {
      canSend: jest.fn((channel: PasswordResetChannels) =>
        sendable.includes(channel),
      ),
      send: jest.fn(async () => undefined),
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new RequestPasswordResetUseCase(
    deps.userRepository as never,
    deps.otpStore as never,
    deps.otpSender as never,
  );
}

describe('RequestPasswordResetUseCase', () => {
  it('có email thì gửi mã và che bớt đích', async () => {
    const deps = makeDeps({ user: User });

    const result = await makeUseCase(deps).handle(Command);

    expect(result.channel).toBe(PasswordResetChannels.EMAIL);
    expect(result.maskedTarget).toBe('ngu***@example.com');
    expect(deps.otpSender.send).toHaveBeenCalledTimes(1);
  });

  it('tài khoản lạ và tài khoản không có liên hệ trả lời GIỐNG HỆT nhau', async () => {
    // Khác nhau một chữ là endpoint này thành công cụ dò username có thật.
    const unknown = await makeUseCase(makeDeps({ user: null })).handle(Command);
    const noContact = await makeUseCase(
      makeDeps({ user: { ...User, email: null } }),
    ).handle(Command);

    expect(unknown).toEqual(noContact);
    expect(unknown.channel).toBe(PasswordResetChannels.ADMIN_SUPPORT);
    expect(unknown.maskedTarget).toBeNull();
  });

  it('chưa cắm nhà cung cấp OTP thì chuyển sang Admin, KHÔNG sinh mã', async () => {
    // Sinh mã rồi không gửi được chỉ tạo rác trong Redis và một lời hứa sai.
    const deps = makeDeps({ user: User, senderConfigured: false });

    const result = await makeUseCase(deps).handle(Command);

    expect(result.channel).toBe(PasswordResetChannels.ADMIN_SUPPORT);
    expect(deps.otpStore.issue).not.toHaveBeenCalled();
    expect(deps.otpSender.send).not.toHaveBeenCalled();
  });

  it('chỉ có SĐT mà kênh SMS chưa sẵn sàng thì chuyển Admin, KHÔNG sinh mã', async () => {
    // Cắm được email KHÔNG có nghĩa là gửi được SMS. Người chỉ có SĐT phải rơi
    // về Admin thay vì nhận một lời hứa gửi tin nhắn mà hệ thống không giữ được.
    const deps = makeDeps({
      user: { ...User, email: null, phone: '0912345678' },
      sendableChannels: [PasswordResetChannels.EMAIL],
    });

    const result = await makeUseCase(deps).handle(Command);

    expect(result.channel).toBe(PasswordResetChannels.ADMIN_SUPPORT);
    expect(deps.otpSender.canSend).toHaveBeenCalledWith(
      PasswordResetChannels.SMS,
    );
    expect(deps.otpStore.issue).not.toHaveBeenCalled();
    expect(deps.otpSender.send).not.toHaveBeenCalled();
  });

  it('tài khoản bị khoá vĩnh viễn không đặt lại mật khẩu được', async () => {
    const deps = makeDeps({ user: { ...User, status: 'BANNED' } });

    const result = await makeUseCase(deps).handle(Command);

    expect(result.channel).toBe(PasswordResetChannels.ADMIN_SUPPORT);
    expect(deps.otpStore.issue).not.toHaveBeenCalled();
  });
});
