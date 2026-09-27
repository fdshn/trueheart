import { OtpInvalidException } from '@/domain/exceptions';
import {
  PasswordResetTokenPrefix,
  PasswordResetTokenTtlSeconds,
  VerifyPasswordResetOtpUseCase,
} from './verify-password-reset-otp.use-case';

const User = {
  globalId: '11111111-1111-1111-1111-111111111111',
  email: 'nguoidung01@example.com',
};

describe('VerifyPasswordResetOtpUseCase', () => {
  it('xác thực OTP đúng thì lưu resetToken vào Redis và trả về kết quả', async () => {
    const userRepository = {
      findByIdentifier: jest.fn().mockResolvedValue(User),
    };
    const otpStore = {
      verify: jest.fn().mockResolvedValue(true),
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
    };

    const useCase = new VerifyPasswordResetOtpUseCase(
      userRepository as never,
      otpStore as never,
      redis as never,
    );

    const result = await useCase.handle({
      reset: {
        identifier: 'nguoidung01@example.com',
        otp: '123456',
      },
    });

    expect(userRepository.findByIdentifier).toHaveBeenCalledWith(
      'nguoidung01@example.com',
    );
    expect(otpStore.verify).toHaveBeenCalledWith(
      'password-reset',
      User.globalId,
      '123456',
    );
    expect(result.expiresInSeconds).toBe(PasswordResetTokenTtlSeconds);
    expect(result.resetToken).toBeDefined();
    expect(typeof result.resetToken).toBe('string');
    expect(redis.set).toHaveBeenCalledWith(
      `${PasswordResetTokenPrefix}${result.resetToken}`,
      User.globalId,
      'EX',
      PasswordResetTokenTtlSeconds,
    );
  });

  it('từ chối khi không tìm thấy tài khoản', async () => {
    const userRepository = {
      findByIdentifier: jest.fn().mockResolvedValue(null),
    };
    const otpStore = {
      verify: jest.fn(),
    };
    const redis = {
      set: jest.fn(),
    };

    const useCase = new VerifyPasswordResetOtpUseCase(
      userRepository as never,
      otpStore as never,
      redis as never,
    );

    await expect(
      useCase.handle({
        reset: {
          identifier: 'khongtontai@example.com',
          otp: '123456',
        },
      }),
    ).rejects.toBeInstanceOf(OtpInvalidException);

    expect(otpStore.verify).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('từ chối khi OTP sai', async () => {
    const userRepository = {
      findByIdentifier: jest.fn().mockResolvedValue(User),
    };
    const otpStore = {
      verify: jest.fn().mockResolvedValue(false),
    };
    const redis = {
      set: jest.fn(),
    };

    const useCase = new VerifyPasswordResetOtpUseCase(
      userRepository as never,
      otpStore as never,
      redis as never,
    );

    await expect(
      useCase.handle({
        reset: {
          identifier: 'nguoidung01@example.com',
          otp: '999999',
        },
      }),
    ).rejects.toBeInstanceOf(OtpInvalidException);

    expect(redis.set).not.toHaveBeenCalled();
  });
});
