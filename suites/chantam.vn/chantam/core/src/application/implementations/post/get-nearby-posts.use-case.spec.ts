import { DiscoveryOriginUnavailableException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IGiftRequestRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostTypes,
  ReactionKinds,
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
    reactionCount: 5,
    commentCount: 2,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
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

/**
 * Người dùng CÓ Vị trí mặc định, để phân biệt hai nhánh của F26: khi client
 * gửi toạ độ thì tuyệt đối không được đọc tới hồ sơ.
 */
function makeUsers() {
  return {
    findOneBy: jest.fn().mockResolvedValue({
      globalId: '99999999-9999-9999-9999-999999999999',
      defaultLocation: { lat: 21.0278, lng: 105.8342 },
    }),
  } as unknown as jest.Mocked<IUserRepository>;
}

function makeReactions(
  mine: Map<string, ReactionKinds> = new Map(),
): jest.Mocked<IContentReactionRepository> {
  return {
    findMyReactions: jest.fn().mockResolvedValue(mine),
    summarize: jest.fn(),
  } as unknown as jest.Mocked<IContentReactionRepository>;
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

    const reactions = makeReactions(
      new Map([[post.globalId, ReactionKinds.CARE]]),
    );

    const result = await new GetNearbyPostsUseCase(
      posts,
      giftRequests,
      makeUsers(),
      reactions,
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
    // Một truy vấn cho cả trang, không phải từng bài.
    expect(reactions.findMyReactions).toHaveBeenCalledWith(
      'POST',
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
          reactionCount: 5,
          commentCount: 2,
          shareCount: 0,
          myReaction: ReactionKinds.CARE,
        },
      ],
      meta: { page: 2, pageSize: 20, total: 41 },
    });
    expect(result.posts[0].post.location).not.toEqual(ExactLocation);
  });

  it('thiếu toạ độ thì lùi về Vị trí mặc định và nói rõ đã lùi', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {} as unknown as jest.Mocked<IGiftRequestRepository>;
    const users = makeUsers();

    const result = await new GetNearbyPostsUseCase(
      posts,
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
    ).handle({
      radiusMeters: 5_000,
      postType: PostTypes.OFFER,
      page: 1,
      pageSize: 20,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ origin: { lat: 21.0278, lng: 105.8342 } }),
    );
    // Im lặng đổi gốc toạ độ là đổi kết quả sau lưng người dùng.
    expect(result.originSource).toBe('DEFAULT_LOCATION');
  });

  it('có toạ độ thì KHÔNG đọc tới hồ sơ', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {} as unknown as jest.Mocked<IGiftRequestRepository>;
    const users = makeUsers();

    const result = await new GetNearbyPostsUseCase(
      posts,
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
    ).handle({
      lat: 10.7724,
      lng: 106.698,
      radiusMeters: 5_000,
      postType: PostTypes.OFFER,
      page: 1,
      pageSize: 20,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(users.findOneBy).not.toHaveBeenCalled();
    expect(result.originSource).toBe('REQUEST');
  });

  it('khách chưa đăng nhập không gửi toạ độ thì báo lỗi rõ ràng', async () => {
    const posts = {
      findNearbyPosts: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new GetNearbyPostsUseCase(
        posts,
        {} as unknown as jest.Mocked<IGiftRequestRepository>,
        makeUsers(),
        makeReactions(),
        makeConfig(),
      ).handle({
        radiusMeters: 5_000,
        postType: PostTypes.OFFER,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(DiscoveryOriginUnavailableException);

    expect(posts.findNearbyPosts).not.toHaveBeenCalled();
  });

  it('người dùng chưa đặt Vị trí mặc định cũng báo lỗi, không quét bừa', async () => {
    const users = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: '99999999-9999-9999-9999-999999999999',
        defaultLocation: null,
      }),
    } as unknown as jest.Mocked<IUserRepository>;

    await expect(
      new GetNearbyPostsUseCase(
        {
          findNearbyPosts: jest.fn(),
        } as unknown as jest.Mocked<IPostRepository>,
        {} as unknown as jest.Mocked<IGiftRequestRepository>,
        users,
        makeReactions(),
        makeConfig(),
      ).handle({
        radiusMeters: 5_000,
        postType: PostTypes.OFFER,
        page: 1,
        pageSize: 20,
        currentUserId: '99999999-9999-9999-9999-999999999999',
      }),
    ).rejects.toBeInstanceOf(DiscoveryOriginUnavailableException);
  });

  it('gửi một nửa toạ độ là lỗi client, không phải ý muốn lùi vị trí', async () => {
    // Bỏ qua nửa kia rồi lùi về vị trí mặc định sẽ quét quanh một chỗ khác
    // hẳn với chỗ client đang chỉ tới.
    const users = makeUsers();

    await expect(
      new GetNearbyPostsUseCase(
        {
          findNearbyPosts: jest.fn(),
        } as unknown as jest.Mocked<IPostRepository>,
        {} as unknown as jest.Mocked<IGiftRequestRepository>,
        users,
        makeReactions(),
        makeConfig(),
      ).handle({
        lat: 10.7724,
        radiusMeters: 5_000,
        postType: PostTypes.OFFER,
        page: 1,
        pageSize: 20,
        currentUserId: '99999999-9999-9999-9999-999999999999',
      }),
    ).rejects.toBeInstanceOf(DiscoveryOriginUnavailableException);

    expect(users.findOneBy).not.toHaveBeenCalled();
  });

  it('khách chưa đăng nhập thì myReaction là null và không hỏi database', async () => {
    const post = makePost();
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [{ post, distanceMeters: 100 }],
        total: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map()),
      findStatusesByPostIdsAndRequester: jest.fn(),
    } as unknown as jest.Mocked<IGiftRequestRepository>;
    const reactions = makeReactions();

    const result = await new GetNearbyPostsUseCase(
      posts,
      giftRequests,
      makeUsers(),
      reactions,
      makeConfig(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      postType: PostTypes.WANTED,
      page: 1,
      pageSize: 20,
    });

    expect(reactions.findMyReactions).not.toHaveBeenCalled();
    expect(result.posts[0].myReaction).toBeNull();
  });
});
