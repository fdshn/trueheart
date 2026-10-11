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

/**
 * Dịch vụ đóng yêu cầu treo, dạng giả.
 *
 * Bài đóng lại mà để hàng đợi nguyên thì người xin không bao giờ nhận được câu
 * trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần của họ.
 */
function makeCloseOpenRequests() {
  return { closeFor: jest.fn(async () => 0) } as never;
}

describe('ListAdminPostsUseCase', () => {
  it('KHÔNG tự lọc theo trạng thái nào khi Admin không chọn', async () => {
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

    // Không còn hàng đợi duyệt, nên mặc định lọc một trạng thái là cho Admin
    // một màn hình trống rồi để họ tự đoán là do không có bài hay do hỏng.
    expect(posts.findAdminPosts).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
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
      moderateByAdmin: jest.fn().mockResolvedValue(entity),
      findAdminByGlobalId: jest.fn().mockResolvedValue(summary),
      // Hạn DỰ PHÒNG phụ thuộc LOẠI bài từ 11/10 (CHỐT-10), nên use case đọc bài
      // trước khi quyết. Mock thiếu hàm này thì cả ba phép kiểm dưới đây ném
      // `TypeError`, không phải đỏ vì kỳ vọng sai.
      findOneBy: jest.fn().mockResolvedValue({ postType: PostTypes.OFFER }),
    } as unknown as jest.Mocked<IPostRepository>;

    const result = await new ModerateAdminPostUseCase(
      posts,
      makeAdmin(),
      makeCloseOpenRequests(),
    ).handle({
      actorUserId: ActorId,
      postId: PostId,
      moderation: {
        decision: GiftPostStatuses.PUBLISHED,
        reason: '  Nội dung phù hợp  ',
      },
    });

    expect(posts.moderateByAdmin).toHaveBeenCalledWith({
      actorUserId: ActorId,
      postId: PostId,
      status: GiftPostStatuses.PUBLISHED,
      expiresAt: expect.any(Date),
      reason: 'Nội dung phù hợp',
    });
    expect(result.post.status).toBe(GiftPostStatuses.PUBLISHED);
  });

  it.each([
    ['OFFER đi vòng đời 7+30', PostTypes.OFFER, 37],
    ['CLASSIFIED giữ ba tháng', PostTypes.CLASSIFIED, 92],
  ])(
    'hạn dự phòng lúc duyệt theo LOẠI bài: %s',
    async (_label, postType, approxDays) => {
      // Trước 11/10 chỗ này trả `postExpiryDate(now)` cho MỌI loại bài, tức ba
      // tháng. CHỐT-10 cho `OFFER` vòng đời 37 ngày, nên một con số dùng chung là
      // hai luật nói một mức.
      //
      // Đây là hạn DỰ PHÒNG: repository ghi `COALESCE(expires_at, $3)` nên nó chỉ
      // áp cho bài chưa có hạn. Dữ liệu cũ từ thời còn hàng đợi duyệt là đúng tập
      // đó.
      const entity = { globalId: PostId } as IPostEntity;
      const summary = { ...makeSummary(), status: GiftPostStatuses.PUBLISHED };
      const posts = {
        moderateByAdmin: jest.fn().mockResolvedValue(entity),
        findAdminByGlobalId: jest.fn().mockResolvedValue(summary),
        findOneBy: jest.fn().mockResolvedValue({ postType }),
      } as unknown as jest.Mocked<IPostRepository>;

      await new ModerateAdminPostUseCase(
        posts,
        makeAdmin(),
        makeCloseOpenRequests(),
      ).handle({
        actorUserId: ActorId,
        postId: PostId,
        moderation: {
          decision: GiftPostStatuses.PUBLISHED,
          reason: 'Nội dung phù hợp',
        },
      });

      const sent = posts.moderateByAdmin.mock.calls[0][0] as {
        expiresAt: Date;
      };
      const days = Math.round(
        (sent.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      // Ba tháng không phải một số ngày cố định (90–92), nên kẹp khoảng thay vì
      // so bằng. 37 thì chính xác vì nó là phép cộng ngày.
      expect(Math.abs(days - approxDays)).toBeLessThanOrEqual(2);
    },
  );

  it('gỡ bài đang hiện thì KHÔNG kèm hạn mới', async () => {
    const entity = { globalId: PostId } as IPostEntity;
    const summary = { ...makeSummary(), status: GiftPostStatuses.REJECTED };
    const posts = {
      moderateByAdmin: jest.fn().mockResolvedValue(entity),
      findAdminByGlobalId: jest.fn().mockResolvedValue(summary),
      // Hạn DỰ PHÒNG phụ thuộc LOẠI bài từ 11/10 (CHỐT-10), nên use case đọc bài
      // trước khi quyết. Mock thiếu hàm này thì cả ba phép kiểm dưới đây ném
      // `TypeError`, không phải đỏ vì kỳ vọng sai.
      findOneBy: jest.fn().mockResolvedValue({ postType: PostTypes.OFFER }),
    } as unknown as jest.Mocked<IPostRepository>;

    await new ModerateAdminPostUseCase(
      posts,
      makeAdmin(),
      makeCloseOpenRequests(),
    ).handle({
      actorUserId: ActorId,
      postId: PostId,
      moderation: {
        decision: GiftPostStatuses.REJECTED,
        reason: 'Hàng cấm',
      },
    });

    expect(posts.moderateByAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        status: GiftPostStatuses.REJECTED,
        expiresAt: null,
      }),
    );
  });

  it('báo conflict khi trạng thái không cho gỡ, ví dụ bài đang trao dở', async () => {
    const posts = {
      moderateByAdmin: jest.fn().mockResolvedValue(null),
      findOneBy: jest.fn().mockResolvedValue({ postType: PostTypes.OFFER }),
    } as unknown as jest.Mocked<IPostRepository>;

    await expect(
      new ModerateAdminPostUseCase(
        posts,
        makeAdmin(),
        makeCloseOpenRequests(),
      ).handle({
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
