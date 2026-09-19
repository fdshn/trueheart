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

function makeDeps(publicBaseUrl: string) {
  return {
    userRepository: {
      findActiveByUsername: jest.fn(async () => makeUser()),
    },
    postRepository: {
      countPublishedByAuthor: jest.fn(async () => 2),
    },
    pointLedgerRepository: {
      // balance là điểm tiêu được — KHÔNG được ra kênh công khai.
      getSummary: jest.fn(async () => ({ balance: 96, lifetime: 1792 })),
    },
    config: { web: { publicBaseUrl } },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new GetPublicProfileUseCase(
    deps.userRepository as never,
    deps.postRepository as never,
    deps.pointLedgerRepository as never,
    deps.config as never,
  );
}

describe('GetPublicProfileUseCase', () => {
  it('chỉ trả trường được phép công khai, kèm điểm tích luỹ và link chia sẻ', async () => {
    const deps = makeDeps('https://chantam.vn');

    const result = await makeUseCase(deps).handle({ username: 'nguoi-demo' });

    expect(result.profile).toEqual({
      username: 'nguoi-demo',
      fullName: 'Người Demo',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      rank: 'GOLD',
      publishedGiftPostCount: 2,
      lifetimePoints: 1792,
      shareUrl: 'https://chantam.vn/u/nguoi-demo',
    });
    for (const secret of [
      'email',
      'phone',
      'defaultLocation',
      'balance',
      'userId',
    ])
      expect(result.profile).not.toHaveProperty(secret);
  });

  it('chưa cấu hình web công khai thì shareUrl là null, không bịa domain', async () => {
    const deps = makeDeps('');

    const result = await makeUseCase(deps).handle({ username: 'nguoi-demo' });

    expect(result.profile.shareUrl).toBeNull();
  });

  it('không cho xem hồ sơ tài khoản bị xoá hoặc không active', async () => {
    const deps = makeDeps('https://chantam.vn');
    deps.userRepository.findActiveByUsername.mockResolvedValue(null as never);

    await expect(
      makeUseCase(deps).handle({ username: 'khong-co' }),
    ).rejects.toThrow();
    expect(deps.postRepository.countPublishedByAuthor).not.toHaveBeenCalled();
    expect(deps.pointLedgerRepository.getSummary).not.toHaveBeenCalled();
  });
});
