import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GetMyPostsUseCase } from './get-my-posts.use-case';

const UserId = '22222222-2222-2222-2222-222222222222';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: '11111111-1111-1111-1111-111111111111',
    postType: PostTypes.OFFER,
    authorId: UserId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Đồ tặng của tôi',
    description: 'Mô tả',
    location: { lat: 21.0, lng: 105.8 },
    areaLabel: 'Hà Nội',
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
    storage: {
      publicBaseUrl: 'https://cdn.chantam.vn',
    },
  } as unknown as IConfig;
}

describe('GetMyPostsUseCase', () => {
  it('lấy danh sách bài của user thành công kèm số lượng request và media', async () => {
    const post = makePost();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[post], 1]),
    };

    const postRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as jest.Mocked<IPostRepository>;

    const postMediaRepo = {
      listByPostId: jest.fn().mockResolvedValue([
        { id: 10, r2Key: 'posts/1/image.webp', sortOrder: 0 },
      ]),
    } as unknown as jest.Mocked<IPostMediaRepository>;

    const requestMap = new Map<string, number>();
    requestMap.set(post.globalId, 4);

    const giftRequestRepo = {
      countActiveByPostIds: jest.fn().mockResolvedValue(requestMap),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new GetMyPostsUseCase(
      postRepo,
      postMediaRepo,
      giftRequestRepo,
      makeConfig(),
    );

    const result = await useCase.handle({
      userId: UserId,
      page: 1,
      pageSize: 10,
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].post.globalId).toBe(post.globalId);
    expect(result.posts[0].requestCount).toBe(4);
    expect(result.posts[0].media).toHaveLength(1);
    expect(result.posts[0].media[0].url).toBe('https://cdn.chantam.vn/posts/1/image.webp');
    expect(result.meta.total).toBe(1);
  });
});
