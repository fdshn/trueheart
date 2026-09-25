import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { BenThanhMarket } from './__fixtures';
import { GetNearbyGiftPostsUseCase } from './get-nearby-gift-posts.use-case';

function makePost(): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.OFFER,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000006',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { ...BenThanhMarket },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {
      condition: GiftPostConditions.USED,
      estimatedValue: 1_500_000,
    },
    expiresAt: null,
    renewedCount: 0,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
    likeCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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
      maxLoginAttemptsPerIp: 30,
      maxRegistrationsPerIp: 5,
      registrationWindowSeconds: 3600,
    },
    docsServers: [],
    otpEmail: { fromAddress: '', fromName: 'Chân Tâm' },
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

describe('GetNearbyGiftPostsUseCase compatibility', () => {
  const command = {
    ...BenThanhMarket,
    radiusMeters: 5_000,
    page: 1,
    pageSize: 20,
  };

  it('chuyển page/category legacy thành canonical skip/take/categoryId', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as jest.Mocked<IPostRepository>;

    await new GetNearbyGiftPostsUseCase(posts, makeConfig()).handle({
      ...command,
      page: 3,
      pageSize: 10,
      category: GiftPostCategories.VEHICLE,
    });

    expect(posts.findNearbyPosts).toHaveBeenCalledWith({
      origin: BenThanhMarket,
      radiusMeters: 5_000,
      postType: PostTypes.OFFER,
      categoryId: '30000000-0000-4000-8000-000000000006',
      skip: 20,
      take: 10,
    });
  });

  it('trả legacy envelope với toạ độ jitter và distance bucket', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({
        items: [{ post: makePost(), distanceMeters: 431.7 }],
        total: 1,
      }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetNearbyGiftPostsUseCase(
      posts,
      makeConfig(),
    ).handle(command);

    expect(result.giftPosts[0]).toMatchObject({
      distanceMeters: 400,
      isLocationApproximate: true,
      giftPost: { category: GiftPostCategories.VEHICLE },
    });
    expect(result.giftPosts[0].giftPost.location).not.toEqual(BenThanhMarket);
  });

  it('tính đúng pagination legacy', async () => {
    const posts = {
      findNearbyPosts: jest.fn().mockResolvedValue({ items: [], total: 45 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetNearbyGiftPostsUseCase(
      posts,
      makeConfig(),
    ).handle({
      ...command,
      page: 2,
      pageSize: 20,
    });

    expect(result.meta).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});
