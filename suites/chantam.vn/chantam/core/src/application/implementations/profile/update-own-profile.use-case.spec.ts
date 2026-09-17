import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    globalId: UserId,
    username: 'nguoi-demo',
    passwordHash: 'hash',
    email: 'old@example.com',
    phone: '0900000000',
    fullName: 'Người Cũ',
    avatarUrl: 'https://cdn.example.com/old.png',
    defaultLocation: { lat: 21.028, lng: 105.835 },
    rank: 'MEMBER',
    status: 'ACTIVE',
    phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    suspendedUntil: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeRepository(user = makeUser()) {
  return {
    findOneBy: jest.fn(async () => user),
    findOneByOrFail: jest.fn(async () => user),
    isEmailTaken: jest.fn(async () => false),
    isPhoneTaken: jest.fn(async () => false),
    update: jest.fn(async () => undefined),
  };
}

describe('UpdateOwnProfileUseCase', () => {
  it('đổi SĐT thì huỷ xác minh cũ, nhưng giữ field không gửi lên', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(repository as never);

    await useCase.handle({
      userId: UserId,
      profile: { phone: '0912345678' },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      {
        phone: '0912345678',
        phoneVerifiedAt: null,
      },
    );
  });

  it('không huỷ xác minh khi phone không đổi', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(repository as never);

    await useCase.handle({
      userId: UserId,
      profile: { fullName: 'Người Mới' },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { fullName: 'Người Mới' },
    );
  });

  it('chuẩn hoá email rồi từ chối khi đã thuộc về tài khoản khác', async () => {
    const repository = makeRepository();
    repository.isEmailTaken.mockResolvedValue(true);
    const useCase = new UpdateOwnProfileUseCase(repository as never);

    await expect(
      useCase.handle({
        userId: UserId,
        profile: { email: '  OTHER@EXAMPLE.COM  ' },
      }),
    ).rejects.toThrow();

    expect(repository.isEmailTaken).toHaveBeenCalledWith(
      'other@example.com',
      UserId,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('từ chối update khi tài khoản đã bị xoá', async () => {
    const repository = makeRepository(makeUser({ deletedAt: new Date() }));
    const useCase = new UpdateOwnProfileUseCase(repository as never);

    await expect(
      useCase.handle({ userId: UserId, profile: { fullName: 'Người Mới' } }),
    ).rejects.toThrow();
  });
});
