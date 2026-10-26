import {
  GiftRequestNotFoundException,
  PostInvalidStateException,
  PostNotFoundException,
  SelectRequesterNotAllowedException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
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
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    isSos: false,
    deliveryMethod: null,
    shipPayer: null,
    charityTransferStatus: null,
    charityTransferRequestedAt: null,
    charityTransferNote: null,
    shareCode: 'K7MQ2XRP9A',
    selectionMode: PostSelectionModes.OPTIMAL,
    selectionDeadline: null,
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
    offeringPostId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Đường báo cho người được chọn. Ca "có báo đúng không" nằm ở
 * `accepted-request.notifier.spec.ts`.
 */
/**
 * Quyền chọn tay, dạng giả. Mặc định CHO PHÉP để các phép kiểm cũ vẫn nói về điều
 * chúng vốn nói — không phải vì mọi bậc đều được phép.
 */
function entitlements(allowed = true) {
  return {
    getCapability: jest.fn(async (_userId: string, code: string) => ({
      code,
      allowed,
      limit: 0,
      used: null,
      remaining: null,
      reasonCode: null,
    })),
  } as never;
}

function notifier() {
  return { announce: jest.fn().mockResolvedValue(undefined) } as never;
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

    const useCase = new AcceptGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      entitlements(),
      notifier(),
    );
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
      actorUserId: AuthorId,
      transactionId: expect.any(String),
      allowClassified: true,
    });
  });

  it('ném PostNotFoundException nếu không tìm thấy post', async () => {
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    const giftRequestRepo =
      {} as unknown as jest.Mocked<IGiftRequestRepository>;

    const useCase = new AcceptGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      entitlements(),
      notifier(),
    );
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

    const useCase = new AcceptGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      entitlements(),
      notifier(),
    );
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

    const useCase = new AcceptGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      entitlements(),
      notifier(),
    );
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

    const useCase = new AcceptGiftRequestUseCase(
      postRepo,
      giftRequestRepo,
      entitlements(),
      notifier(),
    );
    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(GiftRequestNotFoundException);
  });
});

describe('AcceptGiftRequestUseCase · quyền chọn tay (CHỐT-10)', () => {
  function build(allowed: boolean) {
    const post = makePost();
    const postRepo = {
      findOneBy: jest.fn().mockResolvedValue(post),
    } as unknown as jest.Mocked<IPostRepository>;
    const giftRequestRepo = {
      findOneBy: jest.fn().mockResolvedValue(makeRequest()),
      acceptRequest: jest.fn().mockResolvedValue({ transactionId: 'trans-1' }),
    } as unknown as jest.Mocked<IGiftRequestRepository>;
    const caps = entitlements(allowed) as unknown as {
      getCapability: jest.Mock;
    };
    return {
      useCase: new AcceptGiftRequestUseCase(
        postRepo,
        giftRequestRepo,
        caps as never,
        notifier(),
      ),
      giftRequestRepo,
      caps,
    };
  }

  it('chủ bài KHÔNG đủ hạng thì bị chặn, không âm thầm chọn hộ', async () => {
    // Tới 10/10 use case này chỉ kiểm "có phải chủ bài không", nên MỌI chủ bài đều
    // chọn tay được — kể cả Người xem. Capability `SELECT_REQUESTER` đã seed đủ năm
    // bậc từ lâu mà không chỗ nào đọc.
    const { useCase } = build(false);

    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toBeInstanceOf(SelectRequesterNotAllowedException);
  });

  it('bị chặn thì KHÔNG đụng tới yêu cầu nào', async () => {
    // Chặn mà vẫn ghi là tệ hơn không chặn.
    const { useCase, giftRequestRepo } = build(false);

    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toThrow();

    expect(giftRequestRepo.acceptRequest).not.toHaveBeenCalled();
  });

  it('kiểm quyền TRƯỚC khi đọc yêu cầu — không tiết lộ id có thật', async () => {
    // Trả `GiftRequestNotFound` trước `Forbidden` là nói cho người gọi biết id đó
    // có tồn tại hay không.
    const { useCase, giftRequestRepo } = build(false);

    await expect(
      useCase.handle({
        postId: PostId,
        requestId: RequestId,
        userId: AuthorId,
      }),
    ).rejects.toThrow();

    expect(giftRequestRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('đọc đúng mã capability SELECT_REQUESTER', async () => {
    const { useCase, caps } = build(true);

    await useCase.handle({
      postId: PostId,
      requestId: RequestId,
      userId: AuthorId,
    });

    expect(caps.getCapability).toHaveBeenCalledWith(
      AuthorId,
      'SELECT_REQUESTER',
    );
  });
});
