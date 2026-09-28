import {
  PostHasLiveTransactionException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { DeletePostUseCase } from './delete-post.use-case';

const PostId = '11111111-1111-1111-1111-111111111111';
const OwnerId = '22222222-2222-2222-2222-222222222222';

function makePost(overrides: Partial<IPostEntity> = {}): IPostEntity {
  return {
    id: 1,
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: OwnerId,
    categoryId: '30000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ',
    description: 'Còn dùng tốt',
    location: { lat: 10.7724, lng: 106.698 },
    areaLabel: 'Quận 1, TP.HCM',
    status: 'PUBLISHED' as never,
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

function makeDeps(
  closed: { transactionId: string; receiverId: string }[] = [],
) {
  return {
    transactions: {
      closeOpenRequestsForPost: jest.fn(async () => closed),
    },
    notifications: { handle: jest.fn(async () => ({ created: true })) },
  };
}

/**
 * Dịch vụ đóng yêu cầu treo, dạng giả.
 *
 * Bài đóng lại mà để hàng đợi nguyên thì người xin không bao giờ nhận được câu
 * trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần của họ.
 */
function makeCloseOpenRequests() {
  return { closeFor: jest.fn(async () => 0) } as never;
}

describe('DeletePostUseCase', () => {
  it('owner xoá mềm post và chuyển trạng thái cancelled', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps();

    await new DeletePostUseCase(
      posts,
      deps.transactions as never,
      deps.notifications as never,
      makeCloseOpenRequests(),
    ).handle({
      postId: PostId,
      userId: OwnerId,
    });

    expect(posts.update).toHaveBeenCalledWith(
      { globalId: PostId },
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(posts.update.mock.calls[0][1].deletedAt).toBeInstanceOf(Date);
  });

  it('từ chối non-owner và post không tồn tại', async () => {
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps();

    await expect(
      new DeletePostUseCase(
        posts,
        deps.transactions as never,
        deps.notifications as never,
        makeCloseOpenRequests(),
      ).handle({
        postId: PostId,
        userId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    posts.findOneBy.mockResolvedValue(null);
    await expect(
      new DeletePostUseCase(
        posts,
        deps.transactions as never,
        deps.notifications as never,
        makeCloseOpenRequests(),
      ).handle({ postId: PostId, userId: OwnerId }),
    ).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it('KHÔNG gỡ được bài đang có người nhận', async () => {
    // Gỡ ngang để lại bên kia một giao dịch trỏ vào bài không còn tồn tại —
    // đúng thứ mà xoá tài khoản và hậu kiểm của Admin đều đã chặn.
    const posts = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ status: 'RESERVED' as never })),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps();

    await expect(
      new DeletePostUseCase(
        posts,
        deps.transactions as never,
        deps.notifications as never,
        makeCloseOpenRequests(),
      ).handle({ postId: PostId, userId: OwnerId }),
    ).rejects.toBeInstanceOf(PostHasLiveTransactionException);

    expect(posts.update).not.toHaveBeenCalled();
    expect(deps.transactions.closeOpenRequestsForPost).not.toHaveBeenCalled();
  });

  it('bài đang bàn giao cũng vậy', async () => {
    const posts = {
      findOneBy: jest
        .fn()
        .mockResolvedValue(makePost({ status: 'DELIVERING' as never })),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps();

    await expect(
      new DeletePostUseCase(
        posts,
        deps.transactions as never,
        deps.notifications as never,
        makeCloseOpenRequests(),
      ).handle({ postId: PostId, userId: OwnerId }),
    ).rejects.toBeInstanceOf(PostHasLiveTransactionException);
  });

  it('đóng yêu cầu còn treo và BÁO cho người xin', async () => {
    // Không đóng thì người xin không bao giờ nhận được câu trả lời, và mỗi yêu
    // cầu treo vẫn ăn một suất trong trần "yêu cầu đang mở" của họ.
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps([
      { transactionId: 'tx-1', receiverId: 'nguoi-xin-1' },
      { transactionId: 'tx-2', receiverId: 'nguoi-xin-2' },
    ]);

    await new DeletePostUseCase(
      posts,
      deps.transactions as never,
      deps.notifications as never,
      makeCloseOpenRequests(),
    ).handle({ postId: PostId, userId: OwnerId });

    expect(deps.notifications.handle).toHaveBeenCalledTimes(2);
    expect(deps.notifications.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'nguoi-xin-1',
        idempotencyKey: 'POST_DELETED:tx-1',
      }),
    );
  });

  it('đẩy thông báo hỏng KHÔNG làm hỏng việc gỡ bài', async () => {
    // Bài đã gỡ xong; ném ở đây chỉ khiến client bấm lại và nhận 404.
    const posts = {
      findOneBy: jest.fn().mockResolvedValue(makePost()),
      update: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;
    const deps = makeDeps([{ transactionId: 'tx-1', receiverId: 'ai-do' }]);
    deps.notifications.handle.mockRejectedValue(new Error('Redis chết'));

    await expect(
      new DeletePostUseCase(
        posts,
        deps.transactions as never,
        deps.notifications as never,
        makeCloseOpenRequests(),
      ).handle({ postId: PostId, userId: OwnerId }),
    ).resolves.toEqual({});
  });
});
