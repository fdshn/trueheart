import { OtpInvalidException } from '@/domain/exceptions';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';
import { PasswordResetTokenPrefix } from './verify-password-reset-otp.use-case';

const User = {
  globalId: '11111111-1111-1111-1111-111111111111',
  email: 'nguoidung01@example.com',
};

function makeDeps(options: {
  user?: unknown;
  otpValid?: boolean;
  redisUserId?: string | null;
}) {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 2 }),
  };

  return {
    userRepository: {
      findByIdentifier: jest.fn(async () => options.user ?? null),
      findOneBy: jest.fn(async () => options.user ?? null),
      update: jest.fn(async () => undefined),
    },
    sessionRepository: {
      createQueryBuilder: jest.fn(() => queryBuilder),
    },
    otpStore: {
      verify: jest.fn(async () => options.otpValid ?? true),
    },
    passwordService: {
      hash: jest.fn(async () => 'hashed_password'),
    },
    denyList: {
      revokeIssuedBefore: jest.fn(async () => undefined),
    },
    redis: {
      get: jest.fn(async () => options.redisUserId ?? null),
      del: jest.fn(async () => 1),
    },
  };
}

describe('ConfirmPasswordResetUseCase', () => {
  describe('Flow mới qua resetToken', () => {
    it('đổi mật khẩu thành công và xoá token khỏi Redis', async () => {
      const deps = makeDeps({ user: User, redisUserId: User.globalId });
      const useCase = new ConfirmPasswordResetUseCase(
        deps.userRepository as never,
        deps.sessionRepository as never,
        deps.otpStore as never,
        deps.passwordService as never,
        deps.denyList as never,
        deps.redis as never,
      );

      const result = await useCase.handle({
        reset: {
          resetToken: 'token_abc123',
          newPassword: 'newPassword123',
          confirmPassword: 'newPassword123',
        },
      });

      expect(deps.redis.get).toHaveBeenCalledWith(
        `${PasswordResetTokenPrefix}token_abc123`,
      );
      expect(deps.redis.del).toHaveBeenCalledWith(
        `${PasswordResetTokenPrefix}token_abc123`,
      );
      expect(deps.userRepository.findOneBy).toHaveBeenCalledWith({
        globalId: User.globalId,
      });
      expect(deps.passwordService.hash).toHaveBeenCalledWith('newPassword123');
      expect(deps.denyList.revokeIssuedBefore).toHaveBeenCalledWith(
        User.globalId,
      );
      expect(result.revokedSessions).toBe(2);
    });

    it('từ chối khi resetToken không tồn tại hoặc hết hạn trong Redis', async () => {
      const deps = makeDeps({ user: User, redisUserId: null });
      const useCase = new ConfirmPasswordResetUseCase(
        deps.userRepository as never,
        deps.sessionRepository as never,
        deps.otpStore as never,
        deps.passwordService as never,
        deps.denyList as never,
        deps.redis as never,
      );

      await expect(
        useCase.handle({
          reset: {
            resetToken: 'invalid_or_expired_token',
            newPassword: 'newPassword123',
            confirmPassword: 'newPassword123',
          },
        }),
      ).rejects.toBeInstanceOf(OtpInvalidException);

      expect(deps.userRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('Flow cũ qua identifier + otp', () => {
    it('đổi mật khẩu thành công qua identifier + otp', async () => {
      const deps = makeDeps({ user: User, otpValid: true });
      const useCase = new ConfirmPasswordResetUseCase(
        deps.userRepository as never,
        deps.sessionRepository as never,
        deps.otpStore as never,
        deps.passwordService as never,
        deps.denyList as never,
        deps.redis as never,
      );

      const result = await useCase.handle({
        reset: {
          identifier: 'nguoidung01@example.com',
          otp: '123456',
          newPassword: 'newPassword123',
          confirmPassword: 'newPassword123',
        },
      });

      expect(deps.userRepository.findByIdentifier).toHaveBeenCalledWith(
        'nguoidung01@example.com',
      );
      expect(deps.otpStore.verify).toHaveBeenCalledWith(
        'password-reset',
        User.globalId,
        '123456',
      );
      expect(deps.passwordService.hash).toHaveBeenCalledWith('newPassword123');
      expect(result.revokedSessions).toBe(2);
    });

    it('từ chối khi OTP không hợp lệ', async () => {
      const deps = makeDeps({ user: User, otpValid: false });
      const useCase = new ConfirmPasswordResetUseCase(
        deps.userRepository as never,
        deps.sessionRepository as never,
        deps.otpStore as never,
        deps.passwordService as never,
        deps.denyList as never,
        deps.redis as never,
      );

      await expect(
        useCase.handle({
          reset: {
            identifier: 'nguoidung01@example.com',
            otp: '000000',
            newPassword: 'newPassword123',
            confirmPassword: 'newPassword123',
          },
        }),
      ).rejects.toBeInstanceOf(OtpInvalidException);

      expect(deps.userRepository.update).not.toHaveBeenCalled();
    });
  });
});
