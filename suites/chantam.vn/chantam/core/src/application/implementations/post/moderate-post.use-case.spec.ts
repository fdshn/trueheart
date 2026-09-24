import { PostInvalidStateException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { ModeratePostUseCase } from './moderate-post.use-case';

const ActorId = '99999999-9999-4999-8999-999999999001';
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

describe('ModeratePostUseCase', () => {
  const makeAdmin = (allowed: boolean) =>
    ({
      hasPermission: jest.fn().mockResolvedValue(allowed),
    }) as unknown as jest.Mocked<IAdminConfigRepository>;

  it('có quyền post.moderate thì publish được, hạn đúng ba tháng lịch', async () => {
    const posts = {
      transitionPendingReview: jest.fn().mockResolvedValue(makePost()),
    } as unknown as jest.Mocked<IPostRepository>;
    const admin = makeAdmin(true);

    await new ModeratePostUseCase(posts, admin).handle({
      postId: PostId,
      userId: ActorId,
      post: { status: GiftPostStatuses.PUBLISHED },
    });

    expect(admin.hasPermission).toHaveBeenCalledWith(ActorId, 'post.moderate');
    expect(posts.transitionPendingReview).toHaveBeenCalledWith(
      PostId,
      GiftPostStatuses.PUBLISHED,
      expect.any(Date),
    );
    const expiresAt = posts.transitionPendingReview.mock.calls[0][2];
    expect(expiresAt?.getMonth()).toBe((new Date().getMonth() + 3) % 12);
  });

  it('thiếu quyền thì chặn TRƯỚC khi đụng tới bài', async () => {
    // Quyền đọc từ RBAC chứ không phải biến môi trường: gỡ quyền trong CMS
    // phải có tác dụng ngay, không cần deploy lại.
    const posts = {
      transitionPendingReview: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ModeratePostUseCase(posts, makeAdmin(false)).handle({
        postId: PostId,
        userId: ActorId,
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
      new ModeratePostUseCase(posts, makeAdmin(true)).handle({
        postId: PostId,
        userId: ActorId,
        post: { status: GiftPostStatuses.REJECTED },
      }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });
});
