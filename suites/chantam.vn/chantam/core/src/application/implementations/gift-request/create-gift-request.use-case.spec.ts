import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IGiftRequestEntity,
  IPostEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { CreateGiftRequestUseCase } from './create-gift-request.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const AuthorId = '22222222-2222-2222-2222-222222222222';
const RequesterId = '33333333-3333-3333-3333-333333333333';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: AuthorId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
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

function makeRequest(
  overrides: Partial<IGiftRequestEntity> = {},
): IGiftRequestEntity {
  return {
    id: 1,
    globalId: '44444444-4444-4444-4444-444444444444',
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

describe('CreateGiftRequestUseCase', () => {
  it('tạo yêu cầu thành công khi bài viết hợp lệ và chưa từng yêu cầu', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    const created = makeRequest();
    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    const result = await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
    });

    expect(giftRequestRepo.create).toHaveBeenCalledWith({
      globalId: expect.any(String),
      postId: PostId,
      requesterId: RequesterId,
      message: 'Em xin món này ạ',
      status: GiftRequestStatuses.PENDING,
      queueJoinedAt: expect.any(Date),
    });
    expect(giftRequestRepo.save).toHaveBeenCalledWith(created);
    expect(result.request.id).toBe(created.globalId);
    expect(result.request.status).toBe(GiftRequestStatuses.PENDING);
  });

  it('cho phép nộp lại nếu trước đó đã rút (WITHDRAWN)', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    const existingWithdrawn = makeRequest({
      status: GiftRequestStatuses.WITHDRAWN,
      withdrawnAt: new Date(),
    });

    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(existingWithdrawn),
      save: jest.fn().mockResolvedValue(existingWithdrawn),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    const result = await useCase.handle({
      postId: PostId,
      requesterId: RequesterId,
      message: 'Nộp lại lần 2',
    });

    expect(existingWithdrawn.status).toBe(GiftRequestStatuses.PENDING);
    expect(existingWithdrawn.message).toBe('Nộp lại lần 2');
    expect(existingWithdrawn.withdrawnAt).toBeNull();
    expect(giftRequestRepo.save).toHaveBeenCalledWith(existingWithdrawn);
    expect(result.request.status).toBe(GiftRequestStatuses.PENDING);
  });

  it('ném PostNotFoundException nếu bài viết không tồn tại', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('ném CannotRequestOwnPostException nếu tác giả tự xin bài của mình', async () => {
    const postRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ authorId: RequesterId })),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(CannotRequestOwnPostException);
  });

  it('ném PostNotAcceptingRequestsException nếu bài chưa PUBLISHED', async () => {
    const postRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ status: GiftPostStatuses.RESERVED })),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do',
      }),
    ).rejects.toBeInstanceOf(PostNotAcceptingRequestsException);
  });

  it('ném GiftRequestDuplicatedException nếu đã có yêu cầu PENDING', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    const existingPending = makeRequest({
      status: GiftRequestStatuses.PENDING,
    });
    const giftRequestRepo = {
      findByPostAndRequester: jest.fn().mockResolvedValue(existingPending),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new CreateGiftRequestUseCase(postRepo, giftRequestRepo);
    await expect(
      useCase.handle({
        postId: PostId,
        requesterId: RequesterId,
        message: 'xin do them lan nua',
      }),
    ).rejects.toBeInstanceOf(GiftRequestDuplicatedException);
  });
});
