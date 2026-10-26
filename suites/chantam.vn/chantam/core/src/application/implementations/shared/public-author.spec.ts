import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { toPublicAuthor, toPublicAuthorSummary } from './public-author';

const user = {
  globalId: '10000000-0000-4000-8000-000000000001',
  username: 'nguoi-demo',
  fullName: 'Người Demo',
  avatarUrl: 'https://cdn.example.com/a.png',
  rank: UserRanks.GOLD,
  createdAt: new Date('2026-01-02T00:00:00Z'),
  email: 'private@example.com',
  phone: '+84912345678',
  passwordHash: 'hash',
  defaultLocation: { lat: 10, lng: 106 },
};

/**
 * Author summary dùng chung (PR #46 §3.4). Chủ dự án duyệt hiện `fullName` ngày 25/10 —
 * đảo CHỐT-11. Email, SĐT, vị trí vẫn KHÔNG bao giờ có mặt.
 */
describe('author summary công khai', () => {
  it('bài đăng: id, username, fullName, avatar, rank, ngày tham gia', () => {
    expect(toPublicAuthor(user as never)).toEqual({
      id: user.globalId,
      username: 'nguoi-demo',
      fullName: 'Người Demo',
      avatarUrl: 'https://cdn.example.com/a.png',
      rank: UserRanks.GOLD,
      joinedAt: user.createdAt,
    });
  });

  it('summary chuẩn: đúng bốn trường', () => {
    expect(toPublicAuthorSummary(user as never)).toEqual({
      username: 'nguoi-demo',
      fullName: 'Người Demo',
      avatarUrl: 'https://cdn.example.com/a.png',
      rank: UserRanks.GOLD,
    });
  });

  it('họ tên trống thì null, không phải chuỗi rỗng', () => {
    expect(
      toPublicAuthorSummary({ ...user, fullName: '   ' } as never).fullName,
    ).toBeNull();
  });

  it('không bao giờ mang email, SĐT, vị trí hay mật khẩu', () => {
    const json = JSON.stringify([
      toPublicAuthor(user as never),
      toPublicAuthorSummary(user as never),
    ]);
    for (const secret of ['private@example.com', '+84912345678', 'hash', '106'])
      expect(json).not.toContain(secret);
  });
});
