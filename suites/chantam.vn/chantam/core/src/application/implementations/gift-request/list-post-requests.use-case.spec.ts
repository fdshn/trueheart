import { PostNotFoundException } from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ListPostRequestsUseCase } from './list-post-requests.use-case';

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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeRequestItem(
  overrides: Partial<IPostRequestItemDto> = {},
): IPostRequestItemDto {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    postId: PostId,
    requesterId: RequesterId,
    message: 'Em xin món này ạ',
    status: GiftRequestStatuses.PENDING,
    queueJoinedAt: new Date(),
    createdAt: new Date(),
    requester: {
      userId: RequesterId,
      username: 'requester1',
      fullName: 'Người xin 1',
      avatarUrl: 'https://example.com/avatar.jpg',
      rank: 'MEMBER',
    },
    ...overrides,
  };
}

describe('ListPostRequestsUseCase', () => {
  it('tác giả xem được danh sách người xin', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;

    const request = makeRequestItem();
    const giftRequestRepo = {
      listByPostId: jest.fn(
        async (_postId: string, _skip: number, _take: number) => ({
          items: [request],
          total: 1,
        }),
      ),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new ListPostRequestsUseCase(postRepo, giftRequestRepo);

    const result = await useCase.handle({
      postId: PostId,
      currentUserId: AuthorId,
    });

    expect(result.total).toBe(1);
    expect(result.requests[0]).toMatchObject({
      id: request.id,
      requesterId: RequesterId,
      message: request.message,
      status: GiftRequestStatuses.PENDING,
      requester: {
        userId: RequesterId,
        username: 'requester1',
        fullName: 'Người xin 1',
      },
    });
  });

  it('người không phải tác giả và không có quyền admin thì bị chặn 403', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo = {
      listByPostId: jest.fn(),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new ListPostRequestsUseCase(postRepo, giftRequestRepo);

    await expect(
      useCase.handle({
        postId: PostId,
        currentUserId: 'other-user-uuid',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(giftRequestRepo.listByPostId).not.toHaveBeenCalled();
  });

  it('ném PostNotFoundException nếu post không tồn tại', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new ListPostRequestsUseCase(postRepo, giftRequestRepo);

    await expect(
      useCase.handle({
        postId: PostId,
        currentUserId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('truyền phân trang xuống repository và trả TỔNG thật', async () => {
    // `total` phải là tổng trong database, không phải số phần tử của trang
    // hiện tại — bài lan truyền có thể nhận hàng nghìn lượt xin.
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo = {
      listByPostId: jest.fn(
        async (_postId: string, _skip: number, _take: number) => ({
          items: [],
          total: 250,
        }),
      ),
    } as unknown as jest.Mocked<IGiftRequestRepository>;

    const result = await new ListPostRequestsUseCase(
      postRepo,
      giftRequestRepo,
    ).handle({
      postId: PostId,
      currentUserId: AuthorId,
      page: 3,
      pageSize: 20,
    });

    expect(giftRequestRepo.listByPostId).toHaveBeenCalledWith(PostId, 40, 20);
    expect(result.total).toBe(250);
  });
});
