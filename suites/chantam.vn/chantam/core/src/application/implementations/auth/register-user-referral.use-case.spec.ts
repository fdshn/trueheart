import { IPasswordService } from '@chantam/service.auth-lib';
import { RegisterUserUseCase } from './register-user.use-case';

const Registration = {
  username: 'new-member',
  password: 'Password123',
  confirmPassword: 'Password123',
  deviceId: 'device-1',
  referralCode: 'UNKNOWN000',
};

describe('RegisterUserUseCase referral binding', () => {
  it('creates account even when referral code is unknown without exposing code existence', async () => {
    const users = {
      isUsernameTaken: jest.fn(async () => false),
      createWithReferral: jest.fn(async () => ({
        user: {
          globalId: '10000000-0000-4000-8000-000000000001',
          username: Registration.username,
        },
        referralApplied: false,
      })),
    };
    const password = {
      hash: jest.fn(async () => 'hash'),
      verify: jest.fn(),
    } as IPasswordService;
    const sessions = {
      issue: jest.fn(async () => ({
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 900,
        },
        user: { userId: '10000000-0000-4000-8000-000000000001' },
      })),
    };
    const useCase = new RegisterUserUseCase(
      users as never,
      password,
      sessions as never,
    );

    await useCase.handle({ registration: Registration });

    expect(users.createWithReferral).toHaveBeenCalledWith(
      expect.objectContaining({
        username: Registration.username,
        referralCode: Registration.referralCode,
      }),
    );
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ username: Registration.username }),
      Registration.deviceId,
      undefined,
    );
  });
});
