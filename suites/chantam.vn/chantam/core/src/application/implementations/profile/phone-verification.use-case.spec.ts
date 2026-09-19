import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { ConfirmPhoneVerificationUseCase } from './confirm-phone-verification.use-case';
import { RequestPhoneVerificationUseCase } from './request-phone-verification.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const Phone = '+84912345678';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    globalId: UserId,
    phone: Phone,
    phoneVerifiedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('Phone verification', () => {
  it('gửi OTP chỉ tới SĐT hiện gắn với tài khoản', async () => {
    const users = { findOneBy: jest.fn(async () => makeUser()) };
    const otpStore = {
      issue: jest.fn(async () => ({ code: '123456', expiresInSeconds: 300 })),
      verify: jest.fn(),
    };
    const sender = {
      canSend: jest.fn(() => true),
      send: jest.fn(async () => undefined),
    };
    const useCase = new RequestPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      sender as never,
    );

    const result = await useCase.handle({ userId: UserId });

    expect(otpStore.issue).toHaveBeenCalledWith(
      'phone-verification',
      `${UserId}:${Phone}`,
    );
    expect(sender.send).toHaveBeenCalledWith('SMS', Phone, '123456');
    expect(result.expiresInSeconds).toBe(300);
  });

  it('không phát mã khi sender chỉ gửi được EMAIL chứ không gửi được SMS', async () => {
    // Một nhà cung cấp email đã cắm KHÔNG được vô tình mở đường xác minh SĐT.
    const users = { findOneBy: jest.fn(async () => makeUser()) };
    const otpStore = {
      issue: jest.fn(async () => ({ code: '123456', expiresInSeconds: 300 })),
      verify: jest.fn(),
    };
    const sender = {
      canSend: jest.fn(
        (channel: PasswordResetChannels) =>
          channel === PasswordResetChannels.EMAIL,
      ),
      send: jest.fn(async () => undefined),
    };
    const useCase = new RequestPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      sender as never,
    );

    await expect(useCase.handle({ userId: UserId })).rejects.toThrow();

    expect(sender.canSend).toHaveBeenCalledWith(PasswordResetChannels.SMS);
    expect(otpStore.issue).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('records phone evidence and leaves referral qualification centralized in onboarding', async () => {
    const users = {
      findOneBy: jest.fn(async () => makeUser()),
      update: jest.fn(async () => undefined),
    };
    const otpStore = { verify: jest.fn(async () => true) };
    const evidence = { handle: jest.fn(async () => ({ promoted: true })) };
    const points = { handle: jest.fn(async () => undefined) };
    const useCase = new ConfirmPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      evidence as never,
      points as never,
    );

    await useCase.handle({ userId: UserId, verification: { otp: '123456' } });

    expect(users.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { phoneVerifiedAt: expect.any(Date) },
    );
    expect(evidence.handle).toHaveBeenCalledWith({
      userId: UserId,
      evidenceType: OnboardingTaskEvidenceTypes.PHONE_VERIFIED,
    });
  });

  it('appends the first phone reward with a user-scoped idempotency key', async () => {
    const users = {
      findOneBy: jest.fn(async () => makeUser()),
      update: jest.fn(async () => undefined),
    };
    const otpStore = { verify: jest.fn(async () => true) };
    const evidence = { handle: jest.fn(async () => ({ promoted: false })) };
    const points = { handle: jest.fn(async () => undefined) };
    const useCase = new ConfirmPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      evidence as never,
      points as never,
    );

    await useCase.handle({ userId: UserId, verification: { otp: '123456' } });

    expect(points.handle).toHaveBeenCalledWith({
      userId: UserId,
      ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
      referenceType: 'PHONE_VERIFICATION',
      referenceId: UserId,
      idempotencyKey: `PHONE_VERIFIED_FIRST_TIME:${UserId}`,
      actor: 'SYSTEM',
      source: 'PROFILE',
    });
  });

  it('OTP của SĐT cũ không xác minh được SĐT mới', async () => {
    const users = {
      findOneBy: jest.fn(async () => makeUser({ phone: '+84999999999' })),
      update: jest.fn(),
    };
    const otpStore = { verify: jest.fn(async () => false) };
    const evidence = { handle: jest.fn(async () => ({ promoted: false })) };
    const points = { handle: jest.fn(async () => undefined) };
    const useCase = new ConfirmPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      evidence as never,
      points as never,
    );

    await expect(
      useCase.handle({ userId: UserId, verification: { otp: '123456' } }),
    ).rejects.toThrow();
    expect(users.update).not.toHaveBeenCalled();
  });
});
