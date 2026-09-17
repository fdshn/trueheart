import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { makeGiftPost, makeRepositoryMock } from './__fixtures';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';
const Command = {
  userId: UserId,
  giftPost: {
    title: 'Xe đạp cũ còn dùng tốt',
    description:
      'Xe còn dùng tốt, tặng người cần di chuyển đi học hoặc đi làm.',
    category: 'VEHICLE' as never,
    condition: 'USED' as never,
    estimatedValue: 1_500_000,
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
  },
};

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    globalId: UserId,
    username: 'nguoi-tang',
    passwordHash: 'hash',
    fullName: null,
    avatarUrl: null,
    email: null,
    phone: null,
    defaultLocation: null,
    rank: 'VIEWER',
    status: UserStatuses.ACTIVE,
    phoneVerifiedAt: null,
    suspendedUntil: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('CreateGiftPostUseCase — F07 profile gate', () => {
  it('chặn tạo bài khi thiếu bốn trường hồ sơ bắt buộc', async () => {
    const posts = makeRepositoryMock();
    const users = { findOneBy: jest.fn(async () => makeUser()) };
    const useCase = new CreateGiftPostUseCase(posts, users as never);

    await expect(useCase.handle(Command)).rejects.toThrow();
    expect(posts.insert).not.toHaveBeenCalled();
  });

  it('lấy giverId từ userId đã xác thực, không tin request body', async () => {
    const posts = makeRepositoryMock();
    posts.findOneByOrFail.mockResolvedValue(makeGiftPost());
    const users = {
      findOneBy: jest.fn(async () =>
        makeUser({
          fullName: 'Người Tặng',
          avatarUrl: 'https://cdn.example.com/a.png',
          email: 'giver@example.com',
          phone: '0912345678',
        }),
      ),
    };
    const useCase = new CreateGiftPostUseCase(posts, users as never);

    await useCase.handle(Command);

    expect(posts.insert).toHaveBeenCalledWith(
      expect.objectContaining({ giverId: UserId }),
    );
  });
});
