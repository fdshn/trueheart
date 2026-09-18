import { IRegisterDto } from '@chantam.vn/chantam.core-lib/dto';

describe('RegisterDto referral', () => {
  it('allows an optional opaque referral code only at registration', () => {
    const registration: IRegisterDto = {
      username: 'new-member',
      password: 'Password123',
      confirmPassword: 'Password123',
      deviceId: 'device-1',
      referralCode: 'AB12CD34EF',
    };

    expect(registration.referralCode).toBe('AB12CD34EF');
  });
});
