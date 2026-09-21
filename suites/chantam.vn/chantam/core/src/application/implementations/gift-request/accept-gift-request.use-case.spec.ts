import {
  GiftRequestNotFoundException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGiftRequestEntity,
  IPostEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { AcceptGiftRequestUseCase } from './accept-gift-request.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const AuthorId = '22222222-2222-2222-2222-222222222222';
const RequestId = '44444444-4444-4444-4444-444444444444';
const RequesterId = '33333333-3333-3333-3333-333333333333';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    authorId: AuthorId,
    status: GiftPostStatuses.PUBLISHED,
    postType: 'OFFER' as never,
    categoryId: '55555555-5555-5555-5555-555555555555',
    title: 'Test Post',
    description: 'Description',
    areaLabel: 'Hà Nội',
    location: { lat: 21.0, lng: 105.8 },
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

function makeRequest(
  overrides: Partial<IGiftRequestEntity> = {},
): IGiftRequestEntity {
  return {
    id: 1,
    globalId: RequestId,
    postId: PostId,
    requesterId: RequesterId,
    message: 'Em xin món này ạ',
    status: GiftRequestStatuses.PENDING,
    queueJoinedAt: new Date(),
    withdrawnAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('AcceptGiftRequestUseCase', () => {
  it('duyệt thành công: gọi acceptRequest trên repo và trả về kết quả', async () => {
    const post = makePost();
    const request = makeRequest();

    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo = {
      findOneBy: jest.fn().mockResolvedValue(request),
      acceptRequest: jest
        .fn()
        .mockResolvedValue({ transactionId: 'trans-123' }),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(postRepo, giftRequestRepo);
    const result = await useCase.handle({
      postId: PostId,
      requestId: RequestId,
      userId: AuthorId,
    });

    expect(result.status).toBe(GiftRequestStatuses.ACCEPTED);
    expect(result.requestId).toBe(RequestId);
    expect(result.postId).toBe(PostId);
    expect(result.transactionId).toBe('trans-123');
    expect(giftRequestRepo.acceptRequest).toHaveBeenCalledWith({
      requestId: RequestId,
      postId: PostId,
      giverId: AuthorId,
      transactionId: expect.any(String),
    });
  });

  it('ném PostNotFoundException nếu không tìm thấy post', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('ném ForbiddenException nếu người duyệt không phải chủ bài', async () => {
    const post = makePost({ authorId: 'other-user' });
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ném PostInvalidStateException nếu post không ở trạng thái PUBLISHED', async () => {
    const post = makePost({ status: 'DELIVERING' as never });
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });

  it('ném GiftRequestNotFoundException nếu không tìm thấy request hoặc request không phải PENDING', async () => {
    const post = makePost();
    const request = makeRequest({ status: GiftRequestStatuses.ACCEPTED });

    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo = {
      findOneBy: jest.fn().mockResolvedValue(request),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);
  });
});
