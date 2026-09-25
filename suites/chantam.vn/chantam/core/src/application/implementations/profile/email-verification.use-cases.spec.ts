import {
  OtpInvalidException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { NotImplementedException } from '@chantam/service.common-lib/exception';
import {
  ConfirmEmailVerificationUseCase,
  RequestEmailVerificationUseCase,
} from './email-verification.use-cases';

const UserId = '11111111-1111-4111-8111-111111111111';
const User = {
  globalId: UserId,
  email: 'nguoidung01@example.com',
  deletedAt: null,
};

function makeDeps(options: { user?: unknown; canSend?: boolean } = {}) {
  return {
    users: {
      findOneBy: jest.fn(async () =>
        options.user === undefined ? User : options.user,
      ),
      update: jest.fn(async () => undefined),
    },
    otp: {
      issue: jest.fn(async () => ({ code: '123456', expiresInSeconds: 300 })),
      verify: jest.fn(async () => true),
    },
    sender: {
      canSend: jest.fn(async () => options.canSend ?? true),
      send: jest.fn(async () => undefined),
    },
  };
}

describe('RequestEmailVerificationUseCase', () => {
  it('gửi mã tới địa chỉ trong hồ sơ và trả về bản che bớt', async () => {
    const deps = makeDeps();

    const result = await new RequestEmailVerificationUseCase(
      deps.users as never,
      deps.otp as never,
      deps.sender as never,
    ).handle({ userId: UserId });

    expect(deps.sender.send).toHaveBeenCalledWith(
      PasswordResetChannels.EMAIL,
      User.email,
      '123456',
    );
    expect(result.maskedEmail).toBe('ngu***@example.com');
  });

  it('khoá mã gắn CẢ địa chỉ email, không chỉ userId', async () => {
    // Chỉ khoá theo userId thì xin mã cho địa chỉ mình đọc được, đổi sang địa
    // chỉ người khác, rồi xác nhận bằng mã cũ.
    const deps = makeDeps();

    await new RequestEmailVerificationUseCase(
      deps.users as never,
      deps.otp as never,
      deps.sender as never,
    ).handle({ userId: UserId });

    expect(deps.otp.issue).toHaveBeenCalledWith(
      'email-verification',
      `${UserId}:${User.email}`,
    );
  });

  it('chưa cấu hình kênh email thì báo rõ, KHÔNG âm thầm coi như đã gửi', async () => {
    const deps = makeDeps({ canSend: false });

    await expect(
      new RequestEmailVerificationUseCase(
        deps.users as never,
        deps.otp as never,
        deps.sender as never,
      ).handle({ userId: UserId }),
    ).rejects.toBeInstanceOf(NotImplementedException);
    expect(deps.otp.issue).not.toHaveBeenCalled();
  });

  it('hồ sơ chưa có email thì không xin mã được', async () => {
    const deps = makeDeps({ user: { ...User, email: null } });

    await expect(
      new RequestEmailVerificationUseCase(
        deps.users as never,
        deps.otp as never,
        deps.sender as never,
      ).handle({ userId: UserId }),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });
});

describe('ConfirmEmailVerificationUseCase', () => {
  it('mã đúng thì ghi mốc xác minh', async () => {
    const deps = makeDeps();

    const result = await new ConfirmEmailVerificationUseCase(
      deps.users as never,
      deps.otp as never,
    ).handle({ userId: UserId, verification: { otp: '123456' } });

    expect(deps.users.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { emailVerifiedAt: result.verifiedAt },
    );
  });

  it('mã sai thì KHÔNG ghi gì', async () => {
    const deps = makeDeps();
    deps.otp.verify.mockResolvedValue(false);

    await expect(
      new ConfirmEmailVerificationUseCase(
        deps.users as never,
        deps.otp as never,
      ).handle({ userId: UserId, verification: { otp: '000000' } }),
    ).rejects.toBeInstanceOf(OtpInvalidException);
    expect(deps.users.update).not.toHaveBeenCalled();
  });
});
