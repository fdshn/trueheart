import { IPasswordService } from '@chantam/service.auth-lib';
import { RegisterUserUseCase } from './register-user.use-case';

const ClientIp = '203.0.113.7';

const Registration = {
  username: 'new-member',
  password: 'Password123',
  confirmPassword: 'Password123',
  deviceId: 'device-1',
  referralCode: 'UNKNOWN000',
};

function buildUseCase(
  groupOverrides: Partial<{
    findActiveByInviteCode: jest.Mock;
    addMember: jest.Mock;
  }> = {},
) {
  const users = {
    isUsernameTaken: jest.fn(async () => false),
    // Trả lại đúng id đã nhận, như repository thật: id sinh từ username chứ
    // không phải database cấp.
    createWithReferral: jest.fn(async (params: { globalId: string }) => ({
      user: { globalId: params.globalId, username: Registration.username },
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
      user: { userId: 'session-user' },
    })),
  };
  const requestThrottle = {
    assertWithinLimit: jest.fn(async () => undefined),
    registerHit: jest.fn(async () => undefined),
  };
  const config = {
    auth: { maxRegistrationsPerIp: 5, registrationWindowSeconds: 3600 },
    // Pepper rong: bam van chay, chi la do nguoc duoc — dung nhanh ma
    // `hashSignupFingerprint` mo ta cho may dev chua cam gi.
    security: { phoneHashPepper: '' },
  };
  const groups = {
    findActiveByInviteCode: jest.fn().mockResolvedValue(null),
    addMember: jest.fn().mockResolvedValue(undefined),
    ...groupOverrides,
  };

  return {
    users,
    sessions,
    groups,
    requestThrottle,
    useCase: new RegisterUserUseCase(
      users as never,
      password,
      sessions as never,
      groups as never,
      requestThrottle as never,
      config as never,
    ),
  };
}

describe('RegisterUserUseCase referral binding', () => {
  it('creates account even when referral code is unknown without exposing code existence', async () => {
    const { useCase, users, sessions } = buildUseCase();

    await useCase.handle({ registration: Registration, clientIp: ClientIp });

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

describe('RegisterUserUseCase group invite', () => {
  it('joins the group the invite code points at, for the account just created', async () => {
    const { useCase, groups, users } = buildUseCase({
      findActiveByInviteCode: jest.fn().mockResolvedValue({
        groupId: 'group-1',
        ownerId: 'owner-1',
      }),
    });

    await useCase.handle({
      registration: { ...Registration, inviteCode: ' abcd2345efgh6789 ' },
      clientIp: ClientIp,
    });

    // Mã đi qua trim + hoa hết: người dùng dán link kèm khoảng trắng là chuyện
    // thường, và `invite_code` lưu chữ hoa.
    expect(groups.findActiveByInviteCode).toHaveBeenCalledWith(
      'ABCD2345EFGH6789',
    );
    // Đúng tài khoản VỪA tạo, không phải id nào khác.
    const createdId = users.createWithReferral.mock.calls[0]?.[0].globalId;
    expect(createdId).toBeTruthy();
    expect(groups.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-1', userId: createdId }),
    );
  });

  it('still registers when the code is dead — a broken link is the sender fault, not the new user', async () => {
    const { useCase, groups, sessions } = buildUseCase();

    const result = await useCase.handle({
      registration: { ...Registration, inviteCode: 'ZZZZ2345EFGH6789' },
      clientIp: ClientIp,
    });

    expect(groups.addMember).not.toHaveBeenCalled();
    expect(sessions.issue).toHaveBeenCalled();
    expect(result.session.accessToken).toBe('token');
  });

  it('does not look up a group at all when no code was given', async () => {
    const { useCase, groups } = buildUseCase();

    await useCase.handle({ registration: Registration, clientIp: ClientIp });

    expect(groups.findActiveByInviteCode).not.toHaveBeenCalled();
    expect(groups.addMember).not.toHaveBeenCalled();
  });
});

describe('RegisterUserUseCase — trần theo nguồn gọi', () => {
  it('kiểm trần TRƯỚC khi tạo, và chỉ đếm khi TẠO ĐƯỢC', async () => {
    // Tài khoản mới đẻ ra điểm qua referral và affiliate, nên tạo hàng loạt là
    // một đường gian lận chứ không chỉ là rác. Đếm lần gõ hỏng form thì lại
    // phạt người dùng thật cho lỗi đánh máy của họ.
    const { useCase, requestThrottle } = buildUseCase();

    await useCase.handle({ registration: Registration, clientIp: ClientIp });

    expect(requestThrottle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'register-ip',
      key: ClientIp,
      limit: 5,
    });
    expect(requestThrottle.registerHit).toHaveBeenCalledWith({
      bucket: 'register-ip',
      key: ClientIp,
      windowSeconds: 3600,
    });
  });
});
