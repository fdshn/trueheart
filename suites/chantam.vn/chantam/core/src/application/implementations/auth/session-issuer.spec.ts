import { IConfig } from '@/domain/ports/config';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { SessionIssuer } from './session-issuer';

function makeIssuer() {
  const sessionRepository = {
    revokeByDevice: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
  };
  const userRepository = {
    touchActivity: jest.fn().mockResolvedValue(undefined),
  };
  const tokenService = {
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    hashRefreshToken: jest.fn().mockReturnValue('hash'),
    signAccessToken: jest.fn().mockResolvedValue('access'),
  };
  const config = {
    auth: { refreshTtlSeconds: 3600, accessTtlSeconds: 900 },
  } as unknown as IConfig;

  const issuer = new SessionIssuer(
    sessionRepository as never,
    userRepository as never,
    tokenService as never,
    config,
  );

  return { issuer, sessionRepository, userRepository, tokenService };
}

const user = {
  globalId: 'u-1',
  username: 'an',
  rank: 'MEMBER',
  status: 'ACTIVE',
  fullName: 'An',
  avatarUrl: null,
  email: 'an@chantam.test',
  phone: null,
  phoneVerifiedAt: null,
} as unknown as IUserEntity;

describe('SessionIssuer', () => {
  it('đánh dấu tài khoản còn sống mỗi lần cấp phiên', async () => {
    // Đây là chỗ CHUNG của đăng ký, đăng nhập và làm mới token. Đặt mốc ở riêng
    // nhánh đăng nhập sẽ đánh nhầm người mở app hằng ngày bằng refresh token
    // thành không hoạt động, và họ mất phần chia affiliate (F56).
    const { issuer, userRepository } = makeIssuer();

    await issuer.issue(user, 'device-1');

    expect(userRepository.touchActivity).toHaveBeenCalledTimes(1);
    expect(userRepository.touchActivity).toHaveBeenCalledWith('u-1');
  });

  it('thu hồi phiên cũ của cùng thiết bị trước khi cấp phiên mới', async () => {
    // Không thu hồi thì mỗi lần mở app lại đẻ thêm một hàng phiên.
    const { issuer, sessionRepository } = makeIssuer();

    await issuer.issue(user, 'device-1');

    expect(sessionRepository.revokeByDevice).toHaveBeenCalledWith(
      'u-1',
      'device-1',
    );
    expect(
      sessionRepository.revokeByDevice.mock.invocationCallOrder[0],
    ).toBeLessThan(sessionRepository.insert.mock.invocationCallOrder[0]);
  });

  it('không bao giờ trả refresh token ở dạng đã băm', async () => {
    const { issuer, sessionRepository } = makeIssuer();

    const result = await issuer.issue(user, 'device-1');

    expect(result.session.refreshToken).toBe('refresh');
    expect(sessionRepository.insert.mock.calls[0][0].refreshTokenHash).toBe(
      'hash',
    );
  });

  it('chỉ trả đúng các trường hồ sơ đã liệt kê', () => {
    // Trải object sẽ làm mỗi cột thêm vào `users` tự động rò ra API — kể cả
    // `password_hash` và `last_active_at`.
    const dto = SessionIssuer.toOwnUserDto({
      ...user,
      passwordHash: 'KHONG-DUOC-RO',
      lastActiveAt: new Date(),
    } as unknown as IUserEntity);

    expect(Object.keys(dto).sort()).toEqual([
      'avatarUrl',
      'email',
      'fullName',
      'phone',
      'phoneVerified',
      'profileComplete',
      'rank',
      'status',
      'userId',
      'username',
    ]);
  });
});
