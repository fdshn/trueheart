import { IPasswordService } from '@chantam/service.auth-lib';
import { RegisterUserUseCase } from './register-user.use-case';

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
  const groups = {
    findActiveByInviteCode: jest.fn().mockResolvedValue(null),
    addMember: jest.fn().mockResolvedValue(undefined),
    ...groupOverrides,
  };

  return {
    users,
    sessions,
    groups,
    useCase: new RegisterUserUseCase(
      users as never,
      password,
      sessions as never,
      groups as never,
    ),
  };
}

describe('RegisterUserUseCase referral binding', () => {
  it('creates account even when referral code is unknown without exposing code existence', async () => {
    const { useCase, users, sessions } = buildUseCase();

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
    });

    expect(groups.addMember).not.toHaveBeenCalled();
    expect(sessions.issue).toHaveBeenCalled();
    expect(result.session.accessToken).toBe('token');
  });

  it('does not look up a group at all when no code was given', async () => {
    const { useCase, groups } = buildUseCase();

    await useCase.handle({ registration: Registration });

    expect(groups.findActiveByInviteCode).not.toHaveBeenCalled();
    expect(groups.addMember).not.toHaveBeenCalled();
  });
});
