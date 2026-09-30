import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IGiftRequestRepository,
  IGiftTransactionRepository,
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
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    renewedCount: 0,
    reactionCount: 12,
    commentCount: 3,
    shareCount: 1,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
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
      phone: '0901234567',
      avatarUrl: null,
      rank: 'SILVER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  }) as unknown as jest.Mocked<IUserRepository>;

const makeGiftTransactionRepo = () =>
  ({
    hasLiveForPost: jest.fn().mockResolvedValue(false),
    isReceiverOfPost: jest.fn().mockResolvedValue(false),
  }) as unknown as jest.Mocked<IGiftTransactionRepository>;

const makeReactions = () =>
  ({
    summarize: jest.fn().mockResolvedValue({
      total: 12,
      breakdown: { LIKE: 8, LOVE: 4 },
      myReaction: ReactionKinds.LOVE,
    }),
    findMyReactions: jest.fn(),
  }) as unknown as jest.Mocked<IContentReactionRepository>;

describe('GetPostUseCase', () => {
  it.each([false, true])(
    'owner gets original coordinates and canEdit reflects live transaction=%s',
    async (live) => {
      const post = makePost();
      const transactions = makeGiftTransactionRepo();
      transactions.hasLiveForPost.mockResolvedValue(live);
      const result = await new GetPostUseCase(
        {
          findPublicByGlobalId: jest.fn().mockResolvedValue(post),
        } as unknown as IPostRepository,
        {
          listByPostId: jest.fn().mockResolvedValue([]),
        } as unknown as IPostMediaRepository,
        makeGiftRequestRepo(),
        transactions,
        makeUserRepo(),
        makeReactions(),
        makeConfig(),
      ).handle({ postId: PostId, currentUserId: post.authorId });
      expect(result.post.location).toEqual(ExactLocation);
      expect(result.isLocationApproximate).toBe(false);
      expect(result.canEdit).toBe(!live);
    },
  );
  it('áp dụng geo jitter cho toạ độ trả ra qua kênh public và bảo vệ quyền riêng tư (không trả fullName)', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const giftTransactionRepository = makeGiftTransactionRepo();
    const userRepository = makeUserRepo();
    const reactions = makeReactions();

    const result = await new GetPostUseCase(
      postRepository,
      postMediaRepository,
      giftRequestRepository,
      giftTransactionRepository,
      userRepository,
      reactions,
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
    // Privacy: author KHÔNG có fullName
    expect(result.author?.username).toBe('cu_si_minh_tue');
    expect(
      (result.author as unknown as Record<string, unknown>).fullName,
    ).toBeUndefined();
    expect(result.author?.joinedAt).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    // Người lạ xem bài: contactInfo = null
    expect(result.contactInfo).toBeNull();
    expect(result.reactionCount).toBe(12);
    expect(result.commentCount).toBe(3);
    expect(result.shareCount).toBe(1);
    expect(result.myReaction).toBe(ReactionKinds.LOVE);
    expect(result.reactionBreakdown).toEqual({ LIKE: 8, LOVE: 4 });
  });

  it('tiết lộ contactInfo khi người xem là receiver đã được chọn', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const giftTransactionRepository = {
      isReceiverOfPost: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IGiftTransactionRepository>;
    const userRepository = makeUserRepo();
    const reactions = makeReactions();

    const receiverId = '88888888-8888-8888-8888-888888888888';
    const result = await new GetPostUseCase(
      postRepository,
      postMediaRepository,
      giftRequestRepository,
      giftTransactionRepository,
      userRepository,
      reactions,
      makeConfig(),
    ).handle({
      postId: PostId,
      currentUserId: receiverId,
    });

    expect(giftTransactionRepository.isReceiverOfPost).toHaveBeenCalledWith(
      PostId,
      receiverId,
    );
    expect(result.contactInfo).toEqual({
      phone: '0901234567',
      address: 'Quận 1, TP.HCM',
    });
  });

  it('chỉ MỘT con số cảm xúc, không có lối đếm thích riêng', async () => {
    // Nút thích và dải cảm xúc là cùng một nút: chạm là LIKE, giữ thì chọn loại
    // khác. Nên `myReaction` nói người gọi đang để gì, `reactionCount` nói tổng
    // bao nhiêu người bày tỏ, và không có con số thứ ba nào cả.
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const reactions = makeReactions();

    const build = () =>
      new GetPostUseCase(
        postRepository,
        postMediaRepository,
        makeGiftRequestRepo(),
        makeGiftTransactionRepo(),
        makeUserRepo(),
        reactions,
        makeConfig(),
      );

    const loving = await build().handle({
      postId: PostId,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });
    expect(loving.myReaction).toBe(ReactionKinds.LOVE);
    expect(loving.reactionBreakdown).toEqual({ LIKE: 8, LOVE: 4 });

    reactions.summarize.mockResolvedValue({
      total: 12,
      breakdown: { LIKE: 9, LOVE: 3 },
      myReaction: ReactionKinds.LIKE,
    });
    const liking = await build().handle({
      postId: PostId,
      currentUserId: '99999999-9999-9999-9999-999999999999',
    });
    expect(liking.myReaction).toBe(ReactionKinds.LIKE);

    // Khách chưa đăng nhập: `null` chứ không phải LIKE — "chưa bày tỏ" và
    // "không biết có bày tỏ hay không" đều ra cùng một giá trị, và đó là ý.
    reactions.summarize.mockResolvedValue({
      total: 12,
      breakdown: { LIKE: 9, LOVE: 3 },
      myReaction: null,
    });
    const anonymous = await build().handle({ postId: PostId });
    expect(anonymous.myReaction).toBeNull();

    // Hai trường cũ đã gỡ hẳn: giữ lại là để client tiếp tục tin rằng thích và
    // cảm xúc là hai hệ thống khác nhau.
    const shape = anonymous as unknown as Record<string, unknown>;
    expect(shape.isLiked).toBeUndefined();
    expect(shape.likeCount).toBeUndefined();
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
    const giftTransactionRepository = makeGiftTransactionRepo();
    const userRepository = makeUserRepo();
    const reactions = makeReactions();
    reactions.summarize.mockResolvedValue({
      total: 12,
      breakdown: { LIKE: 8, LOVE: 4 },
      myReaction: null,
    });

    const result = await new GetPostUseCase(
      postRepository,
      postMediaRepository,
      giftRequestRepository,
      giftTransactionRepository,
      userRepository,
      reactions,
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
    expect(result.myReaction).toBeNull();
  });

  it('coi pending, rejected hoặc deleted là không tồn tại khi repository không trả kết quả', async () => {
    const postRepository = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const postMediaRepository = {
      listByPostId: jest.fn(),
    } as unknown as jest.Mocked<IPostMediaRepository>;
    const giftRequestRepository = makeGiftRequestRepo();
    const giftTransactionRepository = makeGiftTransactionRepo();
    const userRepository = makeUserRepo();
    const reactions = makeReactions();

    await expect(
      new GetPostUseCase(
        postRepository,
        postMediaRepository,
        giftRequestRepository,
        giftTransactionRepository,
        userRepository,
        reactions,
        makeConfig(),
      ).handle({
        postId: PostId,
      }),
    ).rejects.toBeInstanceOf(
      (await import('@/domain/exceptions')).PostNotFoundException,
    );
    expect(postMediaRepository.listByPostId).not.toHaveBeenCalled();
    expect(reactions.summarize).not.toHaveBeenCalled();
  });
});
