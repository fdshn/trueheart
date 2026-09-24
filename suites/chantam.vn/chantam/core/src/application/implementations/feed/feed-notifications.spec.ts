import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  CommentStatuses,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  notifyComment,
  notifyFirstReactionOfDay,
  vietnamDateKey,
} from './feed-notifications';

const PostId = '11111111-1111-1111-1111-111111111111';
const CommentId = '22222222-2222-2222-2222-222222222222';
const PostAuthorId = '33333333-3333-3333-3333-333333333333';
const CommenterId = '44444444-4444-4444-4444-444444444444';
const ParentAuthorId = '55555555-5555-5555-5555-555555555555';

function makeDispatch(): jest.Mocked<IDispatchNotificationUseCase> {
  return {
    handle: jest.fn().mockResolvedValue({ created: true, pushedDevices: 0 }),
  } as unknown as jest.Mocked<IDispatchNotificationUseCase>;
}

function commentParams(overrides = {}) {
  return {
    commentId: CommentId,
    postId: PostId,
    body: 'Món này còn không ạ?',
    status: CommentStatuses.VISIBLE,
    authorId: CommenterId,
    postAuthorId: PostAuthorId,
    parentAuthorId: null as string | null,
    ...overrides,
  };
}

describe('notifyComment', () => {
  it('bình luận gốc thì báo chủ bài', async () => {
    const dispatch = makeDispatch();

    await notifyComment(dispatch, commentParams());

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PostAuthorId,
        type: NotificationTypes.CONTENT_COMMENT_CREATED,
        referenceType: 'POST',
        referenceId: PostId,
        idempotencyKey: `CONTENT_COMMENT:${CommentId}`,
      }),
    );
  });

  it('trả lời thì báo tác giả bình luận cha, không báo chủ bài', async () => {
    const dispatch = makeDispatch();

    await notifyComment(
      dispatch,
      commentParams({ parentAuthorId: ParentAuthorId }),
    );

    expect(dispatch.handle).toHaveBeenCalledTimes(1);
    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ParentAuthorId,
        type: NotificationTypes.CONTENT_COMMENT_REPLIED,
        idempotencyKey: `CONTENT_COMMENT_REPLY:${CommentId}`,
      }),
    );
  });

  it('cha bình luận cũng là chủ bài thì CHỈ một thông báo', async () => {
    // Hai cái cho cùng một sự kiện là dội bom, và người ta sẽ tắt thông báo.
    const dispatch = makeDispatch();

    await notifyComment(
      dispatch,
      commentParams({ parentAuthorId: PostAuthorId }),
    );

    expect(dispatch.handle).toHaveBeenCalledTimes(1);
    expect(dispatch.handle.mock.calls[0][0].userId).toBe(PostAuthorId);
  });

  it('không tự báo chính mình khi bình luận vào bài của mình', async () => {
    const dispatch = makeDispatch();

    await notifyComment(dispatch, commentParams({ authorId: PostAuthorId }));

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('không tự báo chính mình khi trả lời bình luận của mình', async () => {
    const dispatch = makeDispatch();

    await notifyComment(
      dispatch,
      commentParams({ parentAuthorId: CommenterId }),
    );

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('bình luận đang chờ duyệt thì im lặng', async () => {
    // Nó đang ẩn khỏi công khai — báo là làm lộ thứ chưa được duyệt.
    const dispatch = makeDispatch();

    await notifyComment(
      dispatch,
      commentParams({ status: CommentStatuses.PENDING_REVIEW }),
    );

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('bài không có chủ thì không báo cho ai', async () => {
    const dispatch = makeDispatch();

    await notifyComment(dispatch, commentParams({ postAuthorId: null }));

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('bình luận chỉ có ảnh vẫn ra thông báo đọc được', async () => {
    const dispatch = makeDispatch();

    await notifyComment(dispatch, commentParams({ body: '   ' }));

    expect(dispatch.handle.mock.calls[0][0].body).toBe('Đã gửi một ảnh');
  });

  it('cắt bớt bình luận dài để thông báo không thành cả đoạn văn', async () => {
    const dispatch = makeDispatch();

    await notifyComment(dispatch, commentParams({ body: 'a'.repeat(300) }));

    const body = dispatch.handle.mock.calls[0][0].body;
    expect(body.length).toBe(120);
    expect(body.endsWith('...')).toBe(true);
  });
});

describe('notifyFirstReactionOfDay', () => {
  const reactionParams = (overrides = {}) => ({
    postId: PostId,
    postAuthorId: PostAuthorId,
    actorId: CommenterId,
    isNewReaction: true,
    ...overrides,
  });

  it('báo chủ bài, khoá chống trùng mang ngày', async () => {
    const dispatch = makeDispatch();

    await notifyFirstReactionOfDay(dispatch, reactionParams());

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PostAuthorId,
        type: NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY,
        idempotencyKey: `CONTENT_REACTION_FIRST:${PostId}:${vietnamDateKey()}`,
      }),
    );
  });

  it('chỉ ĐỔI loại cảm xúc thì không báo', async () => {
    // Đổi LIKE sang LOVE vẫn là người đó, vẫn là sự quan tâm đó.
    const dispatch = makeDispatch();

    await notifyFirstReactionOfDay(
      dispatch,
      reactionParams({ isNewReaction: false }),
    );

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('không tự báo khi bày tỏ cảm xúc với bài của chính mình', async () => {
    const dispatch = makeDispatch();

    await notifyFirstReactionOfDay(
      dispatch,
      reactionParams({ actorId: PostAuthorId }),
    );

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('hai người thả trong cùng ngày dùng CHUNG một khoá', async () => {
    // Khoá trùng nghĩa là lần thứ hai rơi vào ON CONFLICT DO NOTHING — một
    // bài 200 lượt ra đúng một thông báo mỗi ngày.
    const dispatch = makeDispatch();

    await notifyFirstReactionOfDay(dispatch, reactionParams());
    await notifyFirstReactionOfDay(
      dispatch,
      reactionParams({ actorId: ParentAuthorId }),
    );

    const [first, second] = dispatch.handle.mock.calls;
    expect(first[0].idempotencyKey).toBe(second[0].idempotencyKey);
  });
});

describe('vietnamDateKey', () => {
  it('cắt ngày theo giờ Việt Nam, không theo UTC', async () => {
    // 6 giờ sáng ngày 2 ở Việt Nam vẫn là 23 giờ ngày 1 theo UTC. Cắt theo
    // UTC thì "lần đầu trong ngày" rơi vào 7 giờ sáng giờ ta.
    expect(vietnamDateKey(new Date('2026-09-01T23:00:00.000Z'))).toBe(
      '2026-09-02',
    );
    expect(vietnamDateKey(new Date('2026-09-02T16:00:00.000Z'))).toBe(
      '2026-09-02',
    );
    expect(vietnamDateKey(new Date('2026-09-02T17:00:00.000Z'))).toBe(
      '2026-09-03',
    );
  });
});
