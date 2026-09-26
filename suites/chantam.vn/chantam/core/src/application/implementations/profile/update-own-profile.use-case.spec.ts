import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { StorageValidationError } from '@chantam/service.storage-lib';
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
    avatarUrl: null,
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

function makeEvidence() {
  return { handle: jest.fn(async () => undefined) };
}

function makeStorage() {
  return {
    confirmAvatarUpload: jest.fn(
      async () => 'https://cdn.example.com/avatar.webp',
    ),
  };
}

describe('UpdateOwnProfileUseCase', () => {
  it('gửi defaultLocation null thì xoá hẳn vị trí mặc định', async () => {
    // undefined = giữ nguyên, null = xoá. Thiếu vế null thì người dùng không có
    // cách nào gỡ vị trí đã lưu.
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { defaultLocation: null },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { defaultLocation: null },
    );
  });

  it('không gửi defaultLocation thì giữ nguyên vị trí đang có', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { fullName: 'Người Mới' },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { fullName: 'Người Mới' },
    );
  });

  it('đổi SĐT thì huỷ xác minh cũ, nhưng giữ field không gửi lên', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({ userId: UserId, profile: { phone: '0912345678' } });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { phone: '+84912345678', phoneVerifiedAt: null },
    );
  });

  it('không huỷ xác minh khi phone không đổi', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

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
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

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

  it('chỉ gắn avatar sau khi storage xác nhận key thuộc namespace user', async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      storage as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { avatarKey: `users/${UserId}/avatars/a.webp` },
    });

    expect(storage.confirmAvatarUpload).toHaveBeenCalledWith(
      UserId,
      `users/${UserId}/avatars/a.webp`,
    );
    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { avatarUrl: 'https://cdn.example.com/avatar.webp' },
    );
  });

  it('records profile evidence only after the persisted profile is complete', async () => {
    const completedUser = makeUser({
      fullName: 'Người Mới',
      avatarUrl: 'https://cdn.example.com/avatar.webp',
    });
    const repository = makeRepository(completedUser);
    const evidence = { handle: jest.fn(async () => undefined) };
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      evidence as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { fullName: 'Người Mới' },
    });

    expect(evidence.handle).toHaveBeenCalledWith({
      userId: UserId,
      evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
    });
  });

  it('từ chối update khi tài khoản đã bị xoá', async () => {
    const repository = makeRepository(makeUser({ deletedAt: new Date() }));
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await expect(
      useCase.handle({ userId: UserId, profile: { fullName: 'Người Mới' } }),
    ).rejects.toThrow();
  });

  it('gửi phone null thì xoá SĐT và huỷ verifiedAt nếu trước đó có SĐT', async () => {
    const repository = makeRepository(makeUser({ phone: '0900000000' }));
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { phone: null },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { phone: null, phoneVerifiedAt: null },
    );
  });

  it('gửi email null và avatarKey null thì gán null an toàn', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { email: null, avatarKey: null },
    });

    // Gỡ email cũng gỡ dấu xác minh: giữ lại là để một tài khoản không còn
    // email nào vẫn mang cờ "email đã xác minh".
    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { email: null, avatarUrl: null, emailVerifiedAt: null },
    );
  });

  it('nắn SĐT về E.164 TRƯỚC khi so trùng', async () => {
    // `isPhoneTaken` so chuỗi. Truyền số chưa nắn vào đó thì `0912345678` không
    // đụng `+84912345678`, và cùng một SIM thành hai tài khoản hợp lệ.
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await useCase.handle({
      userId: UserId,
      profile: { phone: '091 234 5678' },
    });

    expect(repository.isPhoneTaken).toHaveBeenCalledWith(
      '+84912345678',
      UserId,
    );
  });

  it('SĐT không nắn được thì báo lỗi nhập liệu, không lưu', async () => {
    const repository = makeRepository();
    const useCase = new UpdateOwnProfileUseCase(
      repository as never,
      makeStorage() as never,
      makeEvidence() as never,
    );

    await expect(
      useCase.handle({ userId: UserId, profile: { phone: '12' } }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('avatarKey hỏng ra lỗi NHẬP LIỆU, không phải 500', async () => {
    const repository = makeRepository();
    const storage = {
      confirmAvatarUpload: jest.fn(async () => {
        throw new StorageValidationError(
          'Key avatar không thuộc chủ thể hiện tại.',
        );
      }),
    };

    await expect(
      new UpdateOwnProfileUseCase(
        repository as never,
        storage as never,
        makeEvidence() as never,
      ).handle({ userId: UserId, profile: { avatarKey: 'users/ai-do/x.jpg' } }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('lỗi HẠ TẦNG thì KHÔNG hoá thành 400', async () => {
    // S3 chết là lỗi hệ thống. Đổi nó thành "dữ liệu bạn gửi sai" là nói dối
    // người dùng và giấu sự cố khỏi cảnh báo.
    const repository = makeRepository();
    const storage = {
      confirmAvatarUpload: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    };

    await expect(
      new UpdateOwnProfileUseCase(
        repository as never,
        storage as never,
        makeEvidence() as never,
      ).handle({
        userId: UserId,
        profile: { avatarKey: 'users/x/avatars/a.jpg' },
      }),
    ).rejects.not.toBeInstanceOf(ValidationFailedException);
  });
});
