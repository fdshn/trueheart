import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GetPostUseCase } from './get-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const ExactLocation = { lat: 10.7724, lng: 106.698 };

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { ...ExactLocation },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    renewedCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeConfig(): IConfig {
  return {
    port: 3000,
    env: 'development',
    version: 'test',
    database: { default: 'postgres://localhost/test' },
    redis: { uri: 'redis://localhost:6379' },
    auth: {
      jwtSecret: 'khong-dung-toi-trong-bai-kiem-tra-nay-0123456789',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 2_592_000,
      bcryptRounds: 4,
      maxLoginAttempts: 5,
      loginLockSeconds: 900,
      otpTtlSeconds: 300,
    },
    docsServers: [],
    otpEmail: { fromAddress: '', fromName: 'Chân Tâm' },
    categoryAdmin: { usernames: [] },
    postOperator: { usernames: [] },
    rankOperator: { usernames: [] },
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl: '' },
    security: { secretEncryptionKey: '' },
    storage: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      publicBaseUrl: 'http://localhost:9000/chantam-test',
    },
    geo: { jitterRadiusMeters: 300 },
  };
}

const makeGiftRequestRepo = () =>
  ({
    countActiveByPostIds: jest.fn().mockResolvedValue(new Map([[PostId, 2]])),
    findStatusesByPostIdsAndRequester: jest
      .fn()
      .mockResolvedValue(new Map([[PostId, GiftRequestStatuses.PENDING]])),
  }) as unknown as jest.Mocked<IGiftRequestRepository>;

const makeUserRepo = () =>
  ({
    findOne: jest.fn().mockResolvedValue({
      globalId: '22222222-2222-2222-2222-222222222222',
      username: 'cu_si_minh_tue',
      fullName: 'Cư sĩ Minh Tuệ',
      avatarUrl: null,
      rank: 'SILVER',
    }),
  }) as unknown as jest.Mocked<IUserRepository>;

describe('GetPostUseCase', () => {
  it('áp dụng geo jitter cho toạ độ trả ra qua kênh public và trả kèm số lượng yêu cầu', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const userRepository = makeUserRepo();

    const result = await new GetPostUseCase(
      postRepository,
      postMediaRepository,
      giftRequestRepository,
      userRepository,
      makeConfig(),
    ).handle({
      postId: PostId,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(postRepository.findPublicByGlobalId).toHaveBeenCalledWith(
      PostId,
      '99999999-9999-9999-9999-999999999999',
    );
    expect(result.isLocationApproximate).toBe(true);
    expect(result.post.location).not.toEqual(ExactLocation);
    expect(result.requestCount).toBe(2);
    expect(result.myRequestStatus).toBe(GiftRequestStatuses.PENDING);
    expect(result.hasRequested).toBe(true);
    expect(result.author?.fullName).toBe('Cư sĩ Minh Tuệ');
  });

  it('trả media đã xếp thứ tự với public URL', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn().mockResolvedValue([
        {
          id: 2,
          postId: PostId,
          r2Key: 'users/u/posts/p/media/second.webp',
          sortOrder: 1,
          createdAt: new Date(),
        },
        {
          id: 1,
          postId: PostId,
          r2Key: 'users/u/posts/p/media/first.webp',
          sortOrder: 0,
          createdAt: new Date(),
        },
      ]),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const userRepository = makeUserRepo();

    const result = await new GetPostUseCase(
      postRepository,
      postMediaRepository,
      giftRequestRepository,
      userRepository,
      makeConfig(),
    ).handle({ postId: PostId });

    expect(result.media).toEqual([
      {
        id: 1,
        url: 'http://localhost:9000/chantam-test/users/u/posts/p/media/first.webp',
        sortOrder: 0,
      },
      {
        id: 2,
        url: 'http://localhost:9000/chantam-test/users/u/posts/p/media/second.webp',
        sortOrder: 1,
      },
    ]);
    expect(result.requestCount).toBe(2);
    expect(result.myRequestStatus).toBeNull();
    expect(result.hasRequested).toBe(false);
  });

  it('coi pending, rejected hoặc deleted là không tồn tại khi repository không trả kết quả', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn(),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const userRepository = makeUserRepo();

    await expect(
      new GetPostUseCase(
        postRepository,
        postMediaRepository,
        giftRequestRepository,
        userRepository,
        makeConfig(),
      ).handle({
        postId: PostId,
      }),
    ).rejects.toBeInstanceOf(
      (await import('@/domain/exceptions')).PostNotFoundException,
    );
    expect(postMediaRepository.listByPostId).not.toHaveBeenCalled();
  });
});
