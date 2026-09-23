import { PostInvalidStateException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IAdminPostSummary,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  ListAdminPostsUseCase,
  ModerateAdminPostUseCase,
} from './admin-post.use-cases';

const ActorId = '11111111-1111-4111-8111-111111111111';
const PostId = '22222222-2222-4222-8222-222222222222';

function makeSummary(): IAdminPostSummary {
  return {
    globalId: PostId,
    postType: PostTypes.OFFER,
    authorId: '33333333-3333-4333-8333-333333333333',
    authorUsername: 'member',
    authorFullName: 'Thành viên',
    categoryId: '44444444-4444-4444-8444-444444444444',
    title: 'Xe đạp còn sử dụng tốt',
    description: 'Mô tả',
    areaLabel: 'Quận 1',
    status: GiftPostStatuses.PENDING_REVIEW,
    totalQuantity: 1,
    remainingQuantity: 1,
    details: {},
    expiresAt: null,
    mediaCount: 2,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    updatedAt: new Date('2026-09-20T00:00:00Z'),
  };
}

function makeAdmin(allowed = true): jest.Mocked<IAdminConfigRepository> {
  return {
    hasPermission: jest.fn().mockResolvedValue(allowed),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

describe('ListAdminPostsUseCase', () => {
  it('mặc định lấy queue PENDING_REVIEW sau khi kiểm permission', async () => {
    const posts = {
      findAdminPosts: jest
        .fn()
        .mockResolvedValue({ items: [makeSummary()], total: 1 }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new ListAdminPostsUseCase(posts, makeAdmin()).handle({
      actorUserId: ActorId,
      page: 1,
      pageSize: 20,
    });

    expect(posts.findAdminPosts).toHaveBeenCalledWith(
      expect.objectContaining({ status: GiftPostStatuses.PENDING_REVIEW }),
    );
    expect(result.posts).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('từ chối trước khi query khi thiếu post.read', async () => {
    const posts = {
      findAdminPosts: jest.fn(),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ListAdminPostsUseCase(posts, makeAdmin(false)).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(posts.findAdminPosts).not.toHaveBeenCalled();
  });
});

describe('ModerateAdminPostUseCase', () => {
  it('gửi actor, reason và expiry vào transaction repository', async () => {
    const entity = { globalId: PostId } as IPostEntity;
    const summary = { ...makeSummary(), status: GiftPostStatuses.PUBLISHED };
    const posts = {
      moderatePendingReviewByAdmin: jest.fn().mockResolvedValue(entity),
      findAdminByGlobalId: jest.fn().mockResolvedValue(summary),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new ModerateAdminPostUseCase(
      posts,
      makeAdmin(),
    ).handle({
      actorUserId: ActorId,
      postId: PostId,
      moderation: {
        decision: GiftPostStatuses.PUBLISHED,
        reason: '  Nội dung phù hợp  ',
      },
    });

    expect(posts.moderatePendingReviewByAdmin).toHaveBeenCalledWith({
      actorUserId: ActorId,
      postId: PostId,
      status: GiftPostStatuses.PUBLISHED,
      expiresAt: expect.any(Date),
      reason: 'Nội dung phù hợp',
    });
    expect(result.post.status).toBe(GiftPostStatuses.PUBLISHED);
  });

  it('báo conflict khi bài không còn PENDING_REVIEW', async () => {
    const posts = {
      moderatePendingReviewByAdmin: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ModerateAdminPostUseCase(posts, makeAdmin()).handle({
        actorUserId: ActorId,
        postId: PostId,
        moderation: {
          decision: GiftPostStatuses.REJECTED,
          reason: 'Không phù hợp',
        },
      }),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });
});
