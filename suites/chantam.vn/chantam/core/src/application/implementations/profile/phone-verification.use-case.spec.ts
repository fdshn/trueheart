import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
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
    const sender = { isConfigured: true, send: jest.fn(async () => undefined) };
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

  it('OTP đúng đặt phone_verified_at, nhưng không tạo điểm khi chưa có ledger', async () => {
    const users = {
      findOneBy: jest.fn(async () => makeUser()),
      update: jest.fn(async () => undefined),
    };
    const otpStore = { verify: jest.fn(async () => true) };
    const evidence = { handle: jest.fn(async () => undefined) };
    const useCase = new ConfirmPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      evidence as never,
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

  it('OTP của SĐT cũ không xác minh được SĐT mới', async () => {
    const users = {
      findOneBy: jest.fn(async () => makeUser({ phone: '+84999999999' })),
      update: jest.fn(),
    };
    const otpStore = { verify: jest.fn(async () => false) };
    const evidence = { handle: jest.fn(async () => undefined) };
    const useCase = new ConfirmPhoneVerificationUseCase(
      users as never,
      otpStore as never,
      evidence as never,
    );

    await expect(
      useCase.handle({ userId: UserId, verification: { otp: '123456' } }),
    ).rejects.toThrow();
    expect(users.update).not.toHaveBeenCalled();
  });
});
