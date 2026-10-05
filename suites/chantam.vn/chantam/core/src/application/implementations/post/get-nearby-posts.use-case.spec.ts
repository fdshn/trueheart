import { DiscoveryOriginUnavailableException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
  PostTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPostEntity,
  IPostMediaEntity,
  IUserEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
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
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
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
      globalRateLimitPerMinute: 600,
      trustProxy: false,
      maxLoginAttemptsPerIp: 30,
      maxRegistrationsPerIp: 5,
      registrationWindowSeconds: 3600,
    },
    docsServers: [],
    otpEmail: { fromAddress: '', fromName: 'Chân Tâm' },
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl: '' },
    security: { secretEncryptionKey: '', phoneHashPepper: '' },
    push: { serviceAccountBase64: '' },
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

function makeAdminConfig(maxRadiusMeters = 5_000) {
  return {
    getConfigValue: jest.fn().mockResolvedValue(maxRadiusMeters),
  };
}

function makeEntitlements(limit = 10_000) {
  return {
    getCapability: jest.fn().mockResolvedValue({
      code: 'DISCOVERY_RADIUS',
      allowed: true,
      limit,
      used: 0,
      remaining: limit,
      reasonCode: null,
    }),
  } as unknown as jest.Mocked<IEntitlementRepository>;
}

/**
 * Người dùng CÓ Vị trí mặc định, để phân biệt hai nhánh của F26: khi client
 * gửi toạ độ thì tuyệt đối không được đọc tới hồ sơ.
 */
function makeUsers(
  authors: Array<Partial<IUserEntity>> = [],
): jest.Mocked<IUserRepository> {
  return {
    findOneBy: jest.fn().mockResolvedValue({
      globalId: '99999999-9999-9999-9999-999999999999',
      defaultLocation: { lat: 21.0278, lng: 105.8342 },
    }),
    // Cùng khuôn với ảnh: một truy vấn cho cả trang, trả phẳng mọi tác giả.
    findByGlobalIds: jest.fn().mockResolvedValue(authors),
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

/**
 * Ảnh của cả trang lấy trong MỘT truy vấn, nên mock trả về danh sách PHẲNG của
 * mọi bài y như `listByPostIds` thật. Trả sẵn theo từng bài sẽ giấu mất lỗi gom
 * nhầm ảnh sang bài khác — đúng thứ cần bắt ở đây.
 */
function makeMedia(
  items: Array<Partial<IPostMediaEntity>> = [],
): jest.Mocked<IPostMediaRepository> {
  return {
    listByPostIds: jest.fn().mockResolvedValue(items),
    listByPostId: jest.fn(),
    countByPostId: jest.fn(),
    attach: jest.fn(),
    replaceOrder: jest.fn(),
    removeByPostId: jest.fn(),
  } as unknown as jest.Mocked<IPostMediaRepository>;
}

describe('GetNearbyPostsUseCase', () => {
  it('chặn guest quét vượt bán kính tối đa đang cấu hình', async () => {
    const useCase = new GetNearbyPostsUseCase(
      {} as never,
      {} as never,
      {} as never,
      makeUsers(),
      {} as never,
      makeConfig(),
      makeAdminConfig(5_000) as never,
      makeEntitlements(),
    );

    await expect(
      useCase.handle({
        lat: ExactLocation.lat,
        lng: ExactLocation.lng,
        radiusMeters: 5_001,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('chặn người dùng đăng nhập quét vượt hạn mức theo hạng', async () => {
    const entitlements = makeEntitlements(10_000);
    const useCase = new GetNearbyPostsUseCase(
      {} as never,
      {} as never,
      {} as never,
      makeUsers(),
      {} as never,
      makeConfig(),
      makeAdminConfig() as never,
      entitlements,
    );

    await expect(
      useCase.handle({
        lat: ExactLocation.lat,
        lng: ExactLocation.lng,
        radiusMeters: 10_001,
        page: 1,
        pageSize: 20,
        currentUserId: '99999999-9999-9999-9999-999999999999',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(entitlements.getCapability).toHaveBeenCalledWith(
      '99999999-9999-9999-9999-999999999999',
      'DISCOVERY_RADIUS',
    );
  });

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
      makeMedia(),
      giftRequests,
      makeUsers(),
      reactions,
      makeConfig(),
      makeAdminConfig() as never,
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
      makeMedia(),
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
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

  it('isSos=true đi xuống repository thành bộ lọc', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;

    await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      {} as unknown as jest.Mocked<IGiftRequestRepository>,
      makeUsers(),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      lat: 10.77,
      lng: 106.69,
      radiusMeters: 5_000,
      isSos: true,
      page: 1,
      pageSize: 20,
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ isSos: true }),
    );
  });

  it('isSos=false và bỏ trống đều KHÔNG lọc', async () => {
    // "Cho tôi xem những bài KHÔNG gấp" không phải một nhu cầu có thật, và ép nó
    // thành bộ lọc thì một client gửi `isSos=false` theo mặc định sẽ âm thầm làm
    // biến mất mọi bài SOS khỏi feed chính.
    for (const isSos of [false, undefined]) {
      const posts = {
        findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      } as unknown as jest.Mocked<IPostRepository>;

      await new GetNearbyPostsUseCase(
        posts,
        makeMedia(),
        {} as unknown as jest.Mocked<IGiftRequestRepository>,
        makeUsers(),
        makeReactions(),
        makeConfig(),
        makeAdminConfig() as never,
      ).handle({
        lat: 10.77,
        lng: 106.69,
        radiusMeters: 5_000,
        isSos,
        page: 1,
        pageSize: 20,
      });

      expect(posts.findNearbyPosts).toHaveBeenCalledWith(
        expect.objectContaining({ isSos: undefined }),
      );
    }
  });

  it('có toạ độ thì KHÔNG đọc tới hồ sơ', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {} as unknown as jest.Mocked<IGiftRequestRepository>;
    const users = makeUsers();

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
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

  it('khách chưa đăng nhập không gửi toạ độ thì trả TOÀN BỘ, không lọc bán kính', async () => {
    const post = makePost();
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [{ post, distanceMeters: null }],
        total: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map()),
      findStatusesByPostIdsAndRequester: jest.fn(),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      makeUsers(),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      postType: PostTypes.OFFER,
      page: 1,
      pageSize: 20,
    });

    // Không gốc thì KHÔNG được truyền bán kính xuống: lọc quanh một điểm
    // không ai chọn chính là thứ nhánh này sinh ra để tránh.
    expect(posts.findNearbyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ origin: undefined, radiusMeters: undefined }),
    );
    expect(result.originSource).toBe('ALL');
    // `0` ở đây là nói dối — nó đọc ra "cách bạn 0 mét".
    expect(result.posts[0].distanceMeters).toBeNull();
    expect(result.posts[0].isLocationApproximate).toBe(true);
  });

  it('đã đăng nhập nhưng chưa đặt Vị trí mặc định thì cũng trả TOÀN BỘ', async () => {
    const users = {
      findOneBy: jest.fn().mockResolvedValue({
        globalId: '99999999-9999-9999-9999-999999999999',
        defaultLocation: null,
      }),
    } as unknown as jest.Mocked<IUserRepository>;
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      {} as unknown as jest.Mocked<IGiftRequestRepository>,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      postType: PostTypes.OFFER,
      page: 1,
      pageSize: 20,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith(
      expect.objectContaining({ origin: undefined, radiusMeters: undefined }),
    );
    expect(result.originSource).toBe('ALL');
  });

  it('có Vị trí mặc định thì vẫn lùi về đó, KHÔNG rơi xuống trả toàn bộ', async () => {
    // Chặng "trả toàn bộ" là chặng CUỐI. Nuốt mất nhánh Vị trí mặc định là bỏ
    // hẳn F26 và đổi kết quả của mọi người đang đăng nhập.
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      {} as unknown as jest.Mocked<IGiftRequestRepository>,
      makeUsers(),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      radiusMeters: 5_000,
      postType: PostTypes.OFFER,
      page: 1,
      pageSize: 20,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { lat: 21.0278, lng: 105.8342 },
        radiusMeters: 5_000,
      }),
    );
    expect(result.originSource).toBe('DEFAULT_LOCATION');
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
        makeMedia(),
        {} as unknown as jest.Mocked<IGiftRequestRepository>,
        users,
        makeReactions(),
        makeConfig(),
        makeAdminConfig() as never,
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
      makeMedia(),
      giftRequests,
      makeUsers(),
      reactions,
      makeConfig(),
      makeAdminConfig() as never,
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

  it('gắn ảnh vào đúng bài, sắp theo sortOrder, và chỉ hỏi ảnh một lần cho cả trang', async () => {
    const first = makePost();
    const second = makePost({
      globalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [
          { post: first, distanceMeters: 100 },
          { post: second, distanceMeters: 200 },
        ],
        total: 2,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map()),
      findStatusesByPostIdsAndRequester: jest.fn(),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    // Trộn hai bài và để sai thứ tự: đúng thứ một truy vấn gộp có thể trả về,
    // và là thứ duy nhất chứng minh use-case tự gom theo bài rồi tự sắp.
    const media = makeMedia([
      { id: 9, postId: second.globalId, r2Key: 'posts/b-1.webp', sortOrder: 1 },
      { id: 7, postId: first.globalId, r2Key: 'posts/a-2.webp', sortOrder: 1 },
      { id: 5, postId: first.globalId, r2Key: 'posts/a-1.webp', sortOrder: 0 },
    ]);

    // Dấu `/` cuối là chuyện thường trong cấu hình; ghép thô sẽ ra `//`.
    const config = makeConfig();
    config.storage.publicBaseUrl = 'https://cdn.chantam.vn/';

    const result = await new GetNearbyPostsUseCase(
      posts,
      media,
      giftRequests,
      makeUsers(),
      makeReactions(),
      config,
      makeAdminConfig() as never,
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    // Một truy vấn cho cả trang — hỏi từng bài là 20 lần đi database mỗi lần cuộn.
    expect(media.listByPostIds).toHaveBeenCalledTimes(1);
    expect(media.listByPostIds).toHaveBeenCalledWith([
      first.globalId,
      second.globalId,
    ]);
    expect(result.posts[0].media).toEqual([
      { id: 5, url: 'https://cdn.chantam.vn/posts/a-1.webp', sortOrder: 0 },
      { id: 7, url: 'https://cdn.chantam.vn/posts/a-2.webp', sortOrder: 1 },
    ]);
    expect(result.posts[1].media).toEqual([
      { id: 9, url: 'https://cdn.chantam.vn/posts/b-1.webp', sortOrder: 1 },
    ]);
  });

  it('bài không có ảnh thì trả mảng rỗng, không phải undefined', async () => {
    // Client dựng carousel bằng `media.length`; `undefined` là một lần nổ.
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

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      makeUsers(),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(result.posts[0].media).toEqual([]);
  });

  it('trang rỗng thì không hỏi ảnh', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;
    const media = makeMedia();

    const result = await new GetNearbyPostsUseCase(
      posts,
      media,
      {} as unknown as jest.Mocked<IGiftRequestRepository>,
      makeUsers(),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(media.listByPostIds).not.toHaveBeenCalled();
    expect(result.posts).toEqual([]);
  });

  it('gắn tác giả vào đúng bài và chỉ tra MỘT hàng cho tác giả đăng nhiều bài', async () => {
    const shared = '22222222-2222-2222-2222-222222222222';
    const other = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const first = makePost();
    const second = makePost({
      globalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    const third = makePost({
      globalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      authorId: other,
    });
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [
          { post: first, distanceMeters: 100 },
          { post: second, distanceMeters: 200 },
          { post: third, distanceMeters: 300 },
        ],
        total: 3,
      }),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequests = {
      countActiveByPostIds: jest.fn().mockResolvedValue(new Map()),
      findStatusesByPostIdsAndRequester: jest.fn(),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const joined = new Date('2026-09-17T17:59:10.190Z');
    const users = makeUsers([
      {
        globalId: shared,
        username: 'sondeptrai',
        avatarUrl: 'https://cdn/avatar.jpeg',
        rank: 'MEMBER',
        createdAt: joined,
      },
      {
        globalId: other,
        username: 'nguoikhac',
        avatarUrl: null,
        rank: 'MEMBER',
        createdAt: joined,
      },
    ] as Array<Partial<IUserEntity>>);

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
      makeEntitlements(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    // Hai bài đầu CÙNG tác giả — hỏi hai lần cho cùng một người là lãng phí
    // đúng thứ mà gộp truy vấn sinh ra để tránh.
    expect(users.findByGlobalIds).toHaveBeenCalledTimes(1);
    const asked = (users.findByGlobalIds as jest.Mock).mock
      .calls[0][0] as string[];
    expect(asked).toHaveLength(2);
    expect([...asked].sort()).toEqual([shared, other].sort());

    expect(result.posts[0].author).toEqual({
      id: shared,
      username: 'sondeptrai',
      avatarUrl: 'https://cdn/avatar.jpeg',
      rank: 'MEMBER',
      joinedAt: joined,
    });
    expect(result.posts[1].author?.username).toBe('sondeptrai');
    expect(result.posts[2].author?.username).toBe('nguoikhac');
  });

  it('KHÔNG lộ thông tin liên lạc của tác giả ra feed công khai', async () => {
    // IPostAuthorDto cấm fullName/phone/address: feed là kênh công khai, khách
    // chưa đăng nhập cũng quét được, nên lộ ở đây là lộ cho cả internet.
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

    // Repository trả NGUYÊN hàng user; lọc là việc của use case.
    const users = makeUsers([
      {
        globalId: post.authorId,
        username: 'sondeptrai',
        avatarUrl: null,
        rank: 'MEMBER',
        createdAt: new Date(),
        fullName: 'Pham Van Son',
        email: 'sonit251203@gmail.com',
        phone: '+84329442505',
        passwordHash: '$2b$12$khong-duoc-lo',
      },
    ] as Array<Partial<IUserEntity>>);

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
      makeEntitlements(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(Object.keys(result.posts[0].author ?? {}).sort()).toEqual([
      'avatarUrl',
      'id',
      'joinedAt',
      'rank',
      'username',
    ]);
    const serialised = JSON.stringify(result.posts[0].author);
    expect(serialised).not.toContain('@gmail');
    expect(serialised).not.toContain('84329442505');
    expect(serialised).not.toContain('$2b$12$');
  });

  it('tác giả đã xoá tài khoản thì vẫn còn username, avatar về null', async () => {
    // Xoá tài khoản là xoá MỀM có ẩn danh: giữ username để không ai đăng ký
    // đúng tên đó rồi mạo danh trong lịch sử giao dịch cũ.
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

    const users = makeUsers([
      {
        globalId: post.authorId,
        username: 'sondeptrai',
        avatarUrl: null,
        rank: 'MEMBER',
        createdAt: new Date(),
        deletedAt: new Date(),
      },
    ] as Array<Partial<IUserEntity>>);

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
      makeEntitlements(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(result.posts[0].author?.username).toBe('sondeptrai');
    expect(result.posts[0].author?.avatarUrl).toBeNull();
  });

  it('mất hàng user thì trả author null chứ không làm vỡ cả trang', async () => {
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

    const result = await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      giftRequests,
      makeUsers([]),
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
      makeEntitlements(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(result.posts[0].author).toBeNull();
  });

  it('trang rỗng thì không hỏi tác giả', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;
    const users = makeUsers();

    await new GetNearbyPostsUseCase(
      posts,
      makeMedia(),
      {} as unknown as jest.Mocked<IGiftRequestRepository>,
      users,
      makeReactions(),
      makeConfig(),
      makeAdminConfig() as never,
      makeEntitlements(),
    ).handle({
      lat: ExactLocation.lat,
      lng: ExactLocation.lng,
      radiusMeters: 5_000,
      page: 1,
      pageSize: 20,
    });

    expect(users.findByGlobalIds).not.toHaveBeenCalled();
  });
});
