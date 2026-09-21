import { GiftPostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GetGiftPostUseCase } from './get-gift-post.use-case';

const GiftPostId = '11111111-1111-1111-1111-111111111111';
const ExactLocation = { lat: 10.7724, lng: 106.698 };

function makePost(): IPostEntity {
  return {
    id: 1,
    globalId: GiftPostId,
    postType: PostTypes.OFFER,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000006',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: ExactLocation,
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: { condition: GiftPostConditions.USED, estimatedValue: 1_500_000 },
    expiresAt: null,
    renewedCount: 0,
    isSos: false,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
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

describe('GetGiftPostUseCase compatibility', () => {
  it('đọc canonical OFFER rồi project đúng legacy envelope với location jitter', async () => {
    const posts = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new GetGiftPostUseCase(posts, makeConfig()).handle({
      giftPostId: GiftPostId,
    });

    expect(posts.findPublicByGlobalId).toHaveBeenCalledWith(GiftPostId);
    expect(result.giftPost.giverId).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
    expect(result.giftPost.category).toBe('VEHICLE');
    expect(result.giftPost.location).not.toEqual(ExactLocation);
    expect(result.isLocationApproximate).toBe(true);
  });

  it('ẩn canonical post không public như legacy not found', async () => {
    const posts = {
      findPublicByGlobalId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new GetGiftPostUseCase(posts, makeConfig()).handle({
        giftPostId: GiftPostId,
      }),
    ).rejects.toBeInstanceOf(GiftPostNotFoundException);
  });
});
