import { GroupInviteInvalidException } from '@/domain/exceptions';
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

function buildUseCase(options: { inviteRejected?: boolean } = {}) {
  const users = {
    isUsernameTaken: jest.fn(async () => false),
    // Trả lại đúng id đã nhận, như repository thật: id sinh từ username chứ
    // không phải database cấp. Mã mời hỏng thì repository ném và rollback cả
    // lượt tạo — mock làm đúng như vậy.
    createWithReferral: jest.fn(
      async (params: { globalId: string; groupInviteCode?: string }) => {
        if (params.groupInviteCode && options.inviteRejected)
          throw new GroupInviteInvalidException();
        return {
          user: { globalId: params.globalId, username: Registration.username },
          referralApplied: false,
          joinedGroupId: params.groupInviteCode ? 'group-1' : null,
        };
      },
    ),
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
  return {
    users,
    sessions,
    requestThrottle,
    useCase: new RegisterUserUseCase(
      users as never,
      password,
      sessions as never,
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
  it('chuyển mã đã chuẩn hoá xuống repository để vào nhóm CÙNG transaction tạo tài khoản', async () => {
    const { useCase, users } = buildUseCase();

    await useCase.handle({
      registration: { ...Registration, inviteCode: ' abcd2345efgh6789 ' },
      clientIp: ClientIp,
    });

    // Mã đi qua trim + hoa hết: người dùng dán link kèm khoảng trắng là chuyện
    // thường, và `invite_code` lưu chữ hoa.
    expect(users.createWithReferral).toHaveBeenCalledWith(
      expect.objectContaining({ groupInviteCode: 'ABCD2345EFGH6789' }),
    );
  });

  it('mã mời hỏng thì KHÔNG đăng ký được — không cấp phiên, không đếm lượt', async () => {
    // Quyết định 16/10: người dùng bấm link mời là muốn vào ĐÚNG nhóm đó; tạo tài
    // khoản rồi lặng lẽ bỏ nhóm là để họ lạc vào app mà không biết vì sao.
    const { useCase, sessions, requestThrottle } = buildUseCase({
      inviteRejected: true,
    });

    await expect(
      useCase.handle({
        registration: { ...Registration, inviteCode: 'ZZZZ2345EFGH6789' },
        clientIp: ClientIp,
      }),
    ).rejects.toThrow(GroupInviteInvalidException);
    expect(sessions.issue).not.toHaveBeenCalled();
    expect(requestThrottle.registerHit).not.toHaveBeenCalled();
  });

  it('không có mã thì không gửi mã nào xuống', async () => {
    const { useCase, users } = buildUseCase();

    await useCase.handle({ registration: Registration, clientIp: ClientIp });

    expect(users.createWithReferral).toHaveBeenCalledWith(
      expect.objectContaining({ groupInviteCode: undefined }),
    );
  });

  it('mã chỉ toàn khoảng trắng coi như không có mã', async () => {
    const { useCase, users } = buildUseCase({ inviteRejected: true });

    await useCase.handle({
      registration: { ...Registration, inviteCode: '   ' },
      clientIp: ClientIp,
    });

    expect(users.createWithReferral).toHaveBeenCalledWith(
      expect.objectContaining({ groupInviteCode: undefined }),
    );
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
