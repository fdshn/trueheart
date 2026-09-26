import { ContentCommentNotFoundException } from '@/domain/exceptions';
import { CommentStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CountPendingAdminCommentsUseCase,
  ListAdminCommentsUseCase,
  ModerateAdminCommentUseCase,
} from './admin-comment.use-cases';

const ActorId = '11111111-1111-1111-1111-111111111111';
const CommentId = '22222222-2222-2222-2222-222222222222';

function makePermissions(allowed: boolean) {
  return { hasPermission: jest.fn(async () => allowed) } as never;
}

function makeComment(status: CommentStatuses) {
  return {
    globalId: CommentId,
    subjectType: 'POST',
    subjectId: '33333333-3333-3333-3333-333333333333',
    authorId: '44444444-4444-4444-4444-444444444444',
    authorUsername: 'nguoibinhluan',
    body: 'nội dung',
    status,
    createdAt: new Date('2026-09-26T00:00:00.000Z'),
  };
}

describe('ListAdminCommentsUseCase', () => {
  it('không có quyền post.moderate thì không đọc được hàng đợi', async () => {
    const comments = { findForAdmin: jest.fn() };

    await expect(
      new ListAdminCommentsUseCase(
        makePermissions(false),
        comments as never,
      ).handle({ actorUserId: ActorId, page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(comments.findForAdmin).not.toHaveBeenCalled();
  });

  it('bỏ trống status thì truyền xuống undefined — repo tự bỏ bình luận đã gỡ', async () => {
    const comments = {
      findForAdmin: jest.fn(async () => ({ items: [], total: 0 })),
    };

    const result = await new ListAdminCommentsUseCase(
      makePermissions(true),
      comments as never,
    ).handle({ actorUserId: ActorId, page: 2, pageSize: 20 });

    expect(comments.findForAdmin).toHaveBeenCalledWith({
      status: undefined,
      skip: 20,
      take: 20,
    });
    expect(result.meta.page).toBe(2);
  });
});

describe('ModerateAdminCommentUseCase', () => {
  function makeManager() {
    return { query: jest.fn(async () => []) };
  }

  it('không có quyền thì không đụng được vào bình luận nào', async () => {
    const comments = { findByGlobalId: jest.fn(), markStatus: jest.fn() };
    const manager = makeManager();

    await expect(
      new ModerateAdminCommentUseCase(
        makePermissions(false),
        comments as never,
        manager as never,
      ).handle({
        actorUserId: ActorId,
        commentId: CommentId,
        moderation: { decision: CommentStatuses.REMOVED, reason: 'spam' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(comments.findByGlobalId).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('reason toàn khoảng trắng bị từ chối — đây là quyết định sẽ bị hỏi lại', async () => {
    const comments = { findByGlobalId: jest.fn(), markStatus: jest.fn() };

    await expect(
      new ModerateAdminCommentUseCase(
        makePermissions(true),
        comments as never,
        makeManager() as never,
      ).handle({
        actorUserId: ActorId,
        commentId: CommentId,
        moderation: { decision: CommentStatuses.REMOVED, reason: '   ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(comments.markStatus).not.toHaveBeenCalled();
  });

  it('bình luận đã gỡ coi như không còn', async () => {
    const comments = {
      findByGlobalId: jest.fn(async () => makeComment(CommentStatuses.REMOVED)),
      markStatus: jest.fn(),
    };

    await expect(
      new ModerateAdminCommentUseCase(
        makePermissions(true),
        comments as never,
        makeManager() as never,
      ).handle({
        actorUserId: ActorId,
        commentId: CommentId,
        moderation: { decision: CommentStatuses.VISIBLE, reason: 'oan' },
      }),
    ).rejects.toBeInstanceOf(ContentCommentNotFoundException);

    expect(comments.markStatus).not.toHaveBeenCalled();
  });

  it('bấm lại đúng quyết định cũ thì không ghi thêm một dòng audit nói rằng có gì đó vừa đổi', async () => {
    const comments = {
      findByGlobalId: jest.fn(async () => makeComment(CommentStatuses.VISIBLE)),
      markStatus: jest.fn(),
      findForAdmin: jest.fn(),
    };
    const manager = makeManager();

    await expect(
      new ModerateAdminCommentUseCase(
        makePermissions(true),
        comments as never,
        manager as never,
      ).handle({
        actorUserId: ActorId,
        commentId: CommentId,
        moderation: { decision: CommentStatuses.VISIBLE, reason: 'cho hiện' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(comments.markStatus).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('cho hiện lại một bình luận chờ duyệt và ghi audit MODERATE_COMMENT kèm trạng thái trước/sau', async () => {
    const before = makeComment(CommentStatuses.PENDING_REVIEW);
    const comments = {
      findByGlobalId: jest.fn(async () => before),
      markStatus: jest.fn(async () => undefined),
      findForAdmin: jest.fn(async () => ({
        items: [
          {
            commentId: CommentId,
            subjectType: 'POST',
            subjectId: before.subjectId,
            subjectTitle: 'Tặng nồi cơm điện',
            authorId: before.authorId,
            authorUsername: before.authorUsername,
            body: before.body,
            status: CommentStatuses.VISIBLE,
            flaggedTerms: 'tu-bi-bat',
            createdAt: before.createdAt,
          },
        ],
        total: 1,
      })),
    };
    const manager = makeManager();

    const result = await new ModerateAdminCommentUseCase(
      makePermissions(true),
      comments as never,
      manager as never,
    ).handle({
      actorUserId: ActorId,
      commentId: CommentId,
      moderation: {
        decision: CommentStatuses.VISIBLE,
        reason: '  chỉ là tiếng lóng  ',
      },
    });

    // Số đếm đi theo trạng thái — `markStatus` lo `comment_count` và
    // `reply_count`, nếu không thì bài hiện "12 bình luận" mà đếm ra 9.
    expect(comments.markStatus).toHaveBeenCalledWith({
      globalId: CommentId,
      status: CommentStatuses.VISIBLE,
    });

    const [sql, params] = manager.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(sql).toContain('MODERATE_COMMENT');
    expect(sql).toContain('CONTENT_COMMENT');
    expect(params[0]).toBe(ActorId);
    expect(params[1]).toBe(CommentId);
    expect(JSON.parse(params[2] as string)).toEqual({
      status: CommentStatuses.PENDING_REVIEW,
    });
    expect(JSON.parse(params[3] as string)).toEqual({
      status: CommentStatuses.VISIBLE,
    });
    // Lý do được cắt khoảng trắng trước khi ghi, không lưu nguyên chuỗi thô.
    expect(params[4]).toBe('chỉ là tiếng lóng');

    expect(result.comment.status).toBe(CommentStatuses.VISIBLE);
    expect(result.comment.subjectTitle).toBe('Tặng nồi cơm điện');
  });

  it('không tìm lại được dòng sau khi xử thì vẫn trả trạng thái MỚI, không trả trạng thái cũ', async () => {
    const before = makeComment(CommentStatuses.VISIBLE);
    const comments = {
      findByGlobalId: jest.fn(async () => before),
      markStatus: jest.fn(async () => undefined),
      findForAdmin: jest.fn(async () => ({ items: [], total: 0 })),
    };

    const result = await new ModerateAdminCommentUseCase(
      makePermissions(true),
      comments as never,
      makeManager() as never,
    ).handle({
      actorUserId: ActorId,
      commentId: CommentId,
      moderation: { decision: CommentStatuses.REMOVED, reason: 'chửi bới' },
    });

    expect(result.comment.status).toBe(CommentStatuses.REMOVED);
    expect(result.comment.commentId).toBe(CommentId);
  });
});

describe('CountPendingAdminCommentsUseCase', () => {
  it('không có quyền thì không biết hàng đợi dài bao nhiêu', async () => {
    const comments = { countPendingForAdmin: jest.fn() };

    await expect(
      new CountPendingAdminCommentsUseCase(
        makePermissions(false),
        comments as never,
      ).handle({ actorUserId: ActorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(comments.countPendingForAdmin).not.toHaveBeenCalled();
  });

  it('trả đúng con số cho huy hiệu, không kèm nội dung bình luận nào', async () => {
    const comments = { countPendingForAdmin: jest.fn(async () => 12) };

    const result = await new CountPendingAdminCommentsUseCase(
      makePermissions(true),
      comments as never,
    ).handle({ actorUserId: ActorId });

    expect(result).toEqual({ pendingComments: 12 });
  });
});
