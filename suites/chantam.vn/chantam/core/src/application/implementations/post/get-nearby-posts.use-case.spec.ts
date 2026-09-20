import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GetNearbyPostsUseCase } from './get-nearby-posts.use-case';

const ExactLocation = { lat: 10.7724, lng: 106.698 };

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.WANTED,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Cần xe đạp đi học',
    description: 'Cho học sinh đi học.',
    location: { ...ExactLocation },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    renewedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
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
      publicBaseUrl: '',
    },
    geo: { jitterRadiusMeters: 300 },
  };
}

describe('GetNearbyPostsUseCase', () => {
  it('forwards requested type and pagination then returns privacy-safe nearby posts with request counts and status', async () => {
    const post = makePost();
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [{ post, distanceMeters: 463 }],
        total: 41,
      }),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequests = {
      countActiveByPostIds: jest
        .fn()
        .mockResolvedValue(new Map([[post.globalId, 3]])),
      findStatusesByPostIdsAndRequester: jest
        .fn()
        .mockResolvedValue(
          new Map([[post.globalId, GiftRequestStatuses.PENDING]]),
        ),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const result = await new GetNearbyPostsUseCase(
      posts,
      giftRequests,
      makeConfig(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      postType: PostTypes.WANTED,
      categoryId: '30000000-0000-4000-8000-000000000001',
      page: 2,
      pageSize: 20,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith({
      origin: ExactLocation,
      radiusMeters: 5_000,
      postType: PostTypes.WANTED,
      categoryId: '30000000-0000-4000-8000-000000000001',
      skip: 20,
      take: 20,
    });
    expect(giftRequests.countActiveByPostIds).toHaveBeenCalledWith([
      post.globalId,
    ]);
    expect(giftRequests.findStatusesByPostIdsAndRequester).toHaveBeenCalledWith(
      [post.globalId],
      '99999999-9999-9999-9999-999999999999',
    );
    expect(result).toMatchObject({
      posts: [
        {
          distanceMeters: 500,
          isLocationApproximate: true,
          post: { postType: PostTypes.WANTED },
          requestCount: 3,
          myRequestStatus: GiftRequestStatuses.PENDING,
          hasRequested: true,
        },
      ],
      meta: { page: 2, pageSize: 20, total: 41 },
    });
    expect(result.posts[0].post.location).not.toEqual(ExactLocation);
  });
});
