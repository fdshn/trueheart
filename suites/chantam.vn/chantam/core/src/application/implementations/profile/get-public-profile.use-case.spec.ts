import { GetPublicProfileUseCase } from './get-public-profile.use-case';

function makeUser() {
  return {
    globalId: '10000000-0000-4000-8000-000000000001',
    username: 'nguoi-demo',
    passwordHash: 'hash-khong-duoc-lo',
    email: 'private@example.com',
    phone: '0912345678',
    fullName: 'Người Demo',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    defaultLocation: { lat: 21.028, lng: 105.835 },
    rank: 'GOLD',
    status: 'ACTIVE',
    phoneVerifiedAt: new Date(),
    suspendedUntil: null,
    deletedAt: null,
  };
}

describe('GetPublicProfileUseCase', () => {
  it('chỉ trả trường được phép công khai', async () => {
    const userRepository = {
      findActiveByUsername: jest.fn(async () => makeUser()),
    };
    const giftPostRepository = {
      countPublishedByGiver: jest.fn(async () => 2),
    };
    const useCase = new GetPublicProfileUseCase(
      userRepository as never,
      giftPostRepository as never,
    );

    const result = await useCase.handle({ username: 'nguoi-demo' });

    expect(result.profile).toEqual({
      username: 'nguoi-demo',
      fullName: 'Người Demo',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      rank: 'GOLD',
      publishedGiftPostCount: 2,
    });
    expect(result.profile).not.toHaveProperty('email');
    expect(result.profile).not.toHaveProperty('phone');
    expect(result.profile).not.toHaveProperty('defaultLocation');
  });

  it('không cho xem hồ sơ tài khoản bị xoá hoặc không active', async () => {
    const userRepository = { findActiveByUsername: jest.fn(async () => null) };
    const giftPostRepository = { countPublishedByGiver: jest.fn() };
    const useCase = new GetPublicProfileUseCase(
      userRepository as never,
      giftPostRepository as never,
    );

    await expect(useCase.handle({ username: 'khong-co' })).rejects.toThrow();
    expect(giftPostRepository.countPublishedByGiver).not.toHaveBeenCalled();
  });
});
