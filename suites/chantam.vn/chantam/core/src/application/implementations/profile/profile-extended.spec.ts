import {
  ContactVisibilities,
  LeaderboardBoards,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';
import { toOwnProfileDto } from './profile.mapper';
import { RequestIntroVideoUploadUseCase } from './request-intro-video-upload.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const Now = new Date('2026-10-25T03:00:00Z');

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    globalId: UserId,
    username: 'nguoi-demo',
    fullName: 'Người Demo',
    avatarUrl: 'https://cdn.test/a.png',
    email: 'demo@example.com',
    phone: '+84912345678',
    defaultLocation: { lat: 10, lng: 106 },
    rank: UserRanks.GOLD,
    status: 'ACTIVE',
    deletedAt: null,
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    leaderboardAnonymous: false,
    slogan: 'Cho đi là còn mãi',
    todayThought: 'Hôm nay trời đẹp',
    todayThoughtUpdatedAt: new Date('2026-10-24T00:00:00Z'),
    introVideoUrl: 'https://cdn.test/users/u/intro-videos/v.mp4',
    introVideoThumbnailUrl: 'https://cdn.test/users/u/intro-thumbnails/t.jpeg',
    emailVisibility: ContactVisibilities.PRIVATE,
    phoneVisibility: ContactVisibilities.PRIVATE,
    ...overrides,
  };
}

function makeUpdate(user = makeUser()) {
  const repository = {
    findOneBy: jest.fn(async () => user),
    findOneByOrFail: jest.fn(async () => user),
    isEmailTaken: jest.fn(async () => false),
    isPhoneTaken: jest.fn(async () => false),
    update: jest.fn(async () => undefined),
  };
  const storage = {
    confirmAvatarUpload: jest.fn(),
    confirmIntroVideoUpload: jest.fn(
      async (_u: string, key: string) => `https://cdn.test/${key}`,
    ),
    confirmIntroThumbnailUpload: jest.fn(
      async (_u: string, key: string) => `https://cdn.test/${key}`,
    ),
  };
  const useCase = new UpdateOwnProfileUseCase(
    repository as never,
    storage as never,
    { handle: jest.fn() } as never,
    () => Now,
  );
  return { repository, storage, useCase };
}

describe('cập nhật hồ sơ mở rộng (PR #46 §3)', () => {
  it('slogan và suy nghĩ hôm nay: cắt khoảng trắng, suy nghĩ ghi mốc cập nhật', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: { slogan: '  Sống tử tế  ', todayThought: '  Bình an  ' },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      {
        slogan: 'Sống tử tế',
        todayThought: 'Bình an',
        todayThoughtUpdatedAt: Now,
      },
    );
  });

  it('chuỗi rỗng hoặc null xoá chữ và xoá luôn mốc', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: { slogan: '   ', todayThought: null },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { slogan: null, todayThought: null, todayThoughtUpdatedAt: null },
    );
  });

  it('gửi lại đúng suy nghĩ cũ thì KHÔNG đổi mốc — "cập nhật hôm nay" phải là thật', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: { todayThought: 'Hôm nay trời đẹp' },
    });

    expect(repository.update).toHaveBeenCalledWith({ globalId: UserId }, {});
  });

  it('chế độ hiển thị liên hệ', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: {
        emailVisibility: ContactVisibilities.PUBLIC,
        phoneVisibility: ContactVisibilities.PRIVATE,
      },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      {
        emailVisibility: ContactVisibilities.PUBLIC,
        phoneVisibility: ContactVisibilities.PRIVATE,
      },
    );
  });

  it('clip giới thiệu: chỉ nhận key đã xác nhận qua storage, lưu URL công khai', async () => {
    const { repository, storage, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: {
        introVideoKey: `users/${UserId}/intro-videos/v.mp4`,
        introVideoThumbnailKey: `users/${UserId}/intro-thumbnails/t.jpeg`,
      },
    });

    expect(storage.confirmIntroVideoUpload).toHaveBeenCalledWith(
      UserId,
      `users/${UserId}/intro-videos/v.mp4`,
    );
    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      {
        introVideoUrl: `https://cdn.test/users/${UserId}/intro-videos/v.mp4`,
        introVideoThumbnailUrl: `https://cdn.test/users/${UserId}/intro-thumbnails/t.jpeg`,
      },
    );
  });

  it('clip mới không kèm ảnh bìa mới: bỏ ảnh bìa của clip cũ', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({
      userId: UserId,
      profile: { introVideoKey: `users/${UserId}/intro-videos/v.mp4` },
    });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      {
        introVideoUrl: `https://cdn.test/users/${UserId}/intro-videos/v.mp4`,
        introVideoThumbnailUrl: null,
      },
    );
  });

  it('gỡ clip (null) thì gỡ luôn ảnh bìa', async () => {
    const { repository, useCase } = makeUpdate();

    await useCase.handle({ userId: UserId, profile: { introVideoKey: null } });

    expect(repository.update).toHaveBeenCalledWith(
      { globalId: UserId },
      { introVideoUrl: null, introVideoThumbnailUrl: null },
    );
  });

  it('ảnh bìa mà hồ sơ không có clip thì 400, không ghi', async () => {
    const { repository, useCase } = makeUpdate(
      makeUser({ introVideoUrl: null, introVideoThumbnailUrl: null }),
    );

    await expect(
      useCase.handle({
        userId: UserId,
        profile: {
          introVideoThumbnailKey: `users/${UserId}/intro-thumbnails/t.jpeg`,
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('hồ sơ của tôi', () => {
  it('có đủ trường mới và chế độ hiển thị liên hệ', () => {
    expect(toOwnProfileDto(makeUser() as never)).toEqual(
      expect.objectContaining({
        slogan: 'Cho đi là còn mãi',
        todayThought: 'Hôm nay trời đẹp',
        todayThoughtUpdatedAt: new Date('2026-10-24T00:00:00Z'),
        introVideoUrl: 'https://cdn.test/users/u/intro-videos/v.mp4',
        introVideoThumbnailUrl:
          'https://cdn.test/users/u/intro-thumbnails/t.jpeg',
        emailVisibility: ContactVisibilities.PRIVATE,
        phoneVisibility: ContactVisibilities.PRIVATE,
      }),
    );
  });
});

describe('hồ sơ công khai mở rộng', () => {
  const reviews = {
    getAccuracy: async () => ({ percent: null, samples: 0 }),
    getRating: async () => ({
      asGiver: { average: null, samples: 0 },
      asReceiver: { average: null, samples: 0 },
    }),
  };
  const make = (
    user = makeUser(),
    standing: unknown = { month: '2026-10', rank: 4, count: 3 },
  ) =>
    new GetPublicProfileUseCase(
      { findActiveByUsername: jest.fn(async () => user) } as never,
      { countPublishedByAuthor: jest.fn(async () => 0) } as never,
      {
        getSummary: jest.fn(async () => ({ balance: 0, lifetime: 0 })),
      } as never,
      { web: { publicBaseUrl: '' } } as never,
      reviews as never,
      { getConfigValue: async () => null } as never,
      { listBadges: jest.fn(async () => []) } as never,
      { findGiversStanding: jest.fn(async () => standing) } as never,
    );

  it('liên hệ PRIVATE không ra ngoài; vị trí mặc định không bao giờ ra', async () => {
    const result = await make().handle({ username: 'nguoi-demo' });

    expect(result.profile.contacts).toEqual({ email: null, phone: null });
    const json = JSON.stringify(result);
    expect(json).not.toContain('demo@example.com');
    expect(json).not.toContain('84912345678');
    expect(json).not.toContain('106');
  });

  it('liên hệ PUBLIC thì trả đúng trường đó', async () => {
    const result = await make(
      makeUser({ emailVisibility: ContactVisibilities.PUBLIC }),
    ).handle({ username: 'nguoi-demo' });

    expect(result.profile.contacts).toEqual({
      email: 'demo@example.com',
      phone: null,
    });
  });

  it('chữ, clip và vị trí tháng trên bảng Người cho', async () => {
    const result = await make().handle({ username: 'nguoi-demo' });

    expect(result.profile).toEqual(
      expect.objectContaining({
        slogan: 'Cho đi là còn mãi',
        todayThought: 'Hôm nay trời đẹp',
        introVideoUrl: 'https://cdn.test/users/u/intro-videos/v.mp4',
        monthlyStanding: {
          month: '2026-10',
          board: LeaderboardBoards.GIVERS,
          rank: 4,
          count: 3,
        },
      }),
    );
  });

  it('người ẩn danh trên bảng thành tích: monthlyStanding null — không lộ qua hồ sơ', async () => {
    const result = await make(makeUser({ leaderboardAnonymous: true })).handle({
      username: 'nguoi-demo',
    });

    expect(result.profile.monthlyStanding).toBeNull();
  });
});

describe('xin đường tải clip giới thiệu', () => {
  it('VIDEO và THUMBNAIL đi đúng hàm ký của storage', async () => {
    const storage = {
      createIntroVideoUpload: jest.fn(async () => ({ key: 'v' })),
      createIntroThumbnailUpload: jest.fn(async () => ({ key: 't' })),
    };
    const useCase = new RequestIntroVideoUploadUseCase(storage as never);

    await useCase.handle({
      userId: UserId,
      kind: 'VIDEO',
      contentType: 'video/mp4',
      contentLength: 1000,
    });
    await useCase.handle({
      userId: UserId,
      kind: 'THUMBNAIL',
      contentType: 'image/jpeg',
      contentLength: 1000,
    });

    expect(storage.createIntroVideoUpload).toHaveBeenCalledWith({
      userId: UserId,
      contentType: 'video/mp4',
      contentLength: 1000,
    });
    expect(storage.createIntroThumbnailUpload).toHaveBeenCalledTimes(1);
  });
});
