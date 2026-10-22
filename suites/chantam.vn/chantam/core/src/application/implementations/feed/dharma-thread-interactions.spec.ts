import { DharmaThreadNotFoundException } from '@/domain/exceptions';
import {
  ContentSubjectTypes,
  NotificationTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ListCommentRepliesUseCase,
  ListCommentsUseCase,
} from './content-comment.use-cases';
import {
  ListContentReactionsUseCase,
  SetContentReactionUseCase,
} from './content-reaction.use-cases';

const ThreadId = '11111111-1111-4111-8111-111111111111';
const CommentId = '22222222-2222-4222-8222-222222222222';
const ThreadAuthorId = '33333333-3333-4333-8333-333333333333';
const ViewerId = '44444444-4444-4444-8444-444444444444';

const emptyPage = { items: [], hasMoreBefore: false, hasMoreAfter: false };

function dharmaWith(status: string | null) {
  return {
    findThreadByGlobalId: jest.fn(async () =>
      status === null
        ? null
        : {
            globalId: ThreadId,
            authorId: ThreadAuthorId,
            status,
            isLocked: false,
          },
    ),
  };
}

/**
 * Đọc bình luận và cảm xúc của chủ đề Diễn đàn Phật Pháp.
 *
 * Ghi đã kiểm chủ đề từ 04/10 (chủ đề phải có thật và đang hiện), nhưng ĐỌC thì chưa:
 * chủ đề đang chờ duyệt hoặc đã bị Admin ẩn trả 404 ở `GET /dharma/threads/:id`, trong
 * khi bình luận của nó vẫn đọc được qua đường danh sách — ẩn chủ đề mà không ẩn cuộc
 * trò chuyện bên dưới.
 */
describe('ListCommentsUseCase — chủ đề Diễn đàn', () => {
  it.each(['PENDING_REVIEW', 'HIDDEN', null])(
    'chủ đề %s thì 404, không đọc bình luận',
    async (status) => {
      const comments = { listRoots: jest.fn(async () => emptyPage) };
      const useCase = new ListCommentsUseCase(
        comments as never,
        dharmaWith(status) as never,
      );

      await expect(
        useCase.handle({
          viewerId: null,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: ThreadId,
        }),
      ).rejects.toBeInstanceOf(DharmaThreadNotFoundException);
      expect(comments.listRoots).not.toHaveBeenCalled();
    },
  );

  it('chủ đề đang hiện thì đọc được', async () => {
    const comments = { listRoots: jest.fn(async () => emptyPage) };
    const useCase = new ListCommentsUseCase(
      comments as never,
      dharmaWith('VISIBLE') as never,
    );

    const result = await useCase.handle({
      viewerId: null,
      subjectType: ContentSubjectTypes.DHARMA_THREAD,
      subjectId: ThreadId,
    });

    expect(result.comments).toEqual([]);
    expect(comments.listRoots).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: ContentSubjectTypes.DHARMA_THREAD,
        subjectId: ThreadId,
      }),
    );
  });

  it('bài đăng KHÔNG đi qua phép kiểm chủ đề', async () => {
    // Luật xem bài nằm ở `findPublicByGlobalId` và phức tạp hơn nhiều (người trong lượt
    // trao xem lại bài đã COMPLETED...). Phép kiểm này chỉ dành cho chủ đề.
    const comments = { listRoots: jest.fn(async () => emptyPage) };
    const dharma = dharmaWith(null);
    const useCase = new ListCommentsUseCase(comments as never, dharma as never);

    await useCase.handle({
      viewerId: null,
      subjectType: ContentSubjectTypes.POST,
      subjectId: ThreadId,
    });

    expect(dharma.findThreadByGlobalId).not.toHaveBeenCalled();
  });
});

describe('ListCommentRepliesUseCase — chủ đề Diễn đàn', () => {
  it('trả lời của một bình luận trong chủ đề đã ẩn cũng 404', async () => {
    const comments = {
      findByGlobalId: jest.fn(async () => ({
        globalId: CommentId,
        subjectType: ContentSubjectTypes.DHARMA_THREAD,
        subjectId: ThreadId,
      })),
      listReplies: jest.fn(async () => emptyPage),
    };
    const useCase = new ListCommentRepliesUseCase(
      comments as never,
      dharmaWith('HIDDEN') as never,
    );

    await expect(
      useCase.handle({ viewerId: null, commentId: CommentId }),
    ).rejects.toBeInstanceOf(DharmaThreadNotFoundException);
    expect(comments.listReplies).not.toHaveBeenCalled();
  });

  it('bình luận của bài đăng thì không hỏi tới chủ đề', async () => {
    const comments = {
      findByGlobalId: jest.fn(async () => ({
        globalId: CommentId,
        subjectType: ContentSubjectTypes.POST,
        subjectId: ThreadId,
      })),
      listReplies: jest.fn(async () => emptyPage),
    };
    const dharma = dharmaWith(null);
    const useCase = new ListCommentRepliesUseCase(
      comments as never,
      dharma as never,
    );

    await useCase.handle({ viewerId: null, commentId: CommentId });

    expect(dharma.findThreadByGlobalId).not.toHaveBeenCalled();
    expect(comments.listReplies).toHaveBeenCalled();
  });
});

describe('ListContentReactionsUseCase — chủ đề Diễn đàn', () => {
  it('chủ đề đã ẩn thì 404, không lộ ai đã bày tỏ', async () => {
    const reactions = {
      summarize: jest.fn(),
      listActors: jest.fn(),
    };
    const useCase = new ListContentReactionsUseCase(
      reactions as never,
      dharmaWith('HIDDEN') as never,
    );

    await expect(
      useCase.handle({
        viewerId: null,
        subjectType: ContentSubjectTypes.DHARMA_THREAD,
        subjectId: ThreadId,
      }),
    ).rejects.toBeInstanceOf(DharmaThreadNotFoundException);
    expect(reactions.listActors).not.toHaveBeenCalled();
  });
});

describe('SetContentReactionUseCase — chủ đề Diễn đàn', () => {
  function makeUseCase(created: boolean) {
    const dispatch = { handle: jest.fn(async () => undefined) };
    const points = { handle: jest.fn(async () => undefined) };
    const useCase = new SetContentReactionUseCase(
      {
        setReaction: jest.fn(async () => ({ created })),
        summarize: jest.fn(async () => ({})),
      } as never,
      { getCapability: jest.fn(async () => ({ allowed: true })) } as never,
      { findOneBy: jest.fn() } as never,
      dharmaWith('VISIBLE') as never,
      dispatch as never,
      points as never,
    );
    return { useCase, dispatch, points };
  }

  const command = {
    userId: ViewerId,
    subjectType: ContentSubjectTypes.DHARMA_THREAD,
    subjectId: ThreadId,
    kind: ReactionKinds.LIKE,
  };

  it('lượt bày tỏ mới báo tác giả chủ đề, mở đúng chủ đề', async () => {
    const { useCase, dispatch } = makeUseCase(true);

    await useCase.handle(command);

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ThreadAuthorId,
        type: NotificationTypes.CONTENT_REACTION_FIRST_OF_DAY,
        referenceType: 'DHARMA_THREAD',
        referenceId: ThreadId,
      }),
    );
  });

  it('KHÔNG cộng điểm — luật điểm cảm xúc là luật của bài đăng', async () => {
    const { useCase, points } = makeUseCase(true);

    await useCase.handle(command);

    expect(points.handle).not.toHaveBeenCalled();
  });
});
