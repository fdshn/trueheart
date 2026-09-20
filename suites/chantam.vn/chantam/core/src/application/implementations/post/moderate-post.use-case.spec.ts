import { PostInvalidStateException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ModeratePostUseCase } from './moderate-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';

function makePost(): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: '22222222-2222-2222-2222-222222222222',
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: GiftPostStatuses.PUBLISHED,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: new Date('2026-12-31T12:00:00.000Z'),
    renewedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function makeConfig(usernames = ['demo-operator']): IConfig {
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
    postOperator: { usernames },
    rankOperator: { usernames: [] },
    adminBootstrap: { usernames: [] },
    web: { publicBaseUrl: '' },
    security: { secretEncryptionKey: '' },
    storage: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'chantam-test',
      accessKeyId: 'test',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'http://localhost:9000/chantam-test',
    },
    geo: { jitterRadiusMeters: 300 },
  };
}

describe('ModeratePostUseCase', () => {
  it('chỉ allowlist tạm thời được publish và expiry đúng ba tháng lịch', async () => {
    const posts = {
      transitionPendingReview: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const useCase = new ModeratePostUseCase(posts, makeConfig());

    await useCase.handle({
      postId: PostId,
      username: 'DEMO-OPERATOR',
      post: { status: GiftPostStatuses.PUBLISHED },
    });

    expect(posts.transitionPendingReview).toHaveBeenCalledWith(
      PostId,
      GiftPostStatuses.PUBLISHED,
      expect.any(Date),
    );
    const expiresAt = posts.transitionPendingReview.mock.calls[0][2];
    expect(expiresAt?.getMonth()).toBe((new Date().getMonth() + 3) % 12);
  });

  it('từ chối username không nằm trong allowlist trước khi query post', async () => {
    const posts = {
      transitionPendingReview: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ModeratePostUseCase(posts, makeConfig()).handle({
        postId: PostId,
        username: 'member',
        post: { status: GiftPostStatuses.REJECTED },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(posts.transitionPendingReview).not.toHaveBeenCalled();
  });

  it('từ chối transition không còn ở pending review', async () => {
    const posts = {
      transitionPendingReview: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ModeratePostUseCase(posts, makeConfig()).handle({
        postId: PostId,
        username: 'demo-operator',
        post: { status: GiftPostStatuses.REJECTED },
      }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });
});
