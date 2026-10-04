import {
  ContentBlockedTermsException,
  TooManyRequestsException,
} from '@/domain/exceptions';
import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { CreateCommentUseCase } from './content-comment.use-cases';

const PostId = '11111111-1111-1111-1111-111111111111';
const UserId = '99999999-9999-9999-9999-999999999999';
const AuthorId = '88888888-8888-8888-8888-888888888888';

/**
 * Bộ khung tối thiểu cho `CreateCommentUseCase`.
 *
 * Mỗi phụ thuộc trả về đường hạnh phúc; từng bài kiểm ghi đè đúng thứ nó quan
 * tâm. Không dựng đủ khung thì mỗi bài kiểm phải lặp lại tám mock giống nhau.
 */
function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const deps = {
    comments: {
      create: jest.fn(async (input: Record<string, unknown>) => ({
        ...input,
        editedAt: null,
        createdAt: new Date('2026-09-26T00:00:00.000Z'),
        replyCount: 0,
        reactionCount: 0,
      })),
      findByGlobalId: jest.fn(),
    },
    entitlements: {
      getCapability: jest.fn(async () => ({ allowed: true })),
    },
    posts: {
      findOneBy: jest.fn(async () => ({
        globalId: PostId,
        deletedAt: null,
        authorId: AuthorId,
      })),
    },
    adminConfig: { getConfigValue: jest.fn(async () => null) },
    storage: { confirmCommentMediaUpload: jest.fn() },
    dispatchNotification: { handle: jest.fn(async () => undefined) },
    throttle: {
      assertWithinLimit: jest.fn(async () => undefined),
      registerHit: jest.fn(async () => undefined),
    },
    points: { handle: jest.fn(async () => undefined) },
    // `findThreadByGlobalId` trả `null` là mặc định đúng cho nhóm spec này: mọi ca ở đây bình
    // luận vào POST, nên nhánh `DHARMA_THREAD` không chạy. Ca chủ đề được canh ở
    // `test:dharma-forum` với chuỗi thật, vì điều đáng kiểm là khoá bình luận có chặn thật
    // không — một mock trả `isLocked: true` chỉ chứng minh `if` có chạy.
    dharma: { findThreadByGlobalId: jest.fn(async () => null) },
    ...overrides,
  };

  const useCase = new CreateCommentUseCase(
    deps.comments as never,
    deps.entitlements as never,
    deps.posts as never,
    deps.dharma as never,
    deps.adminConfig as never,
    deps.storage as never,
    deps.dispatchNotification as never,
    deps.throttle as never,
    deps.points as never,
  );

  return { ...deps, useCase };
}

const command = {
  userId: UserId,
  subjectType: ContentSubjectTypes.POST,
  subjectId: PostId,
  body: 'một bình luận hiền lành',
};

describe('CreateCommentUseCase — cổng quyền và trần tốc độ', () => {
  it('VIEWER không có COMMENT_CONTENT thì không bình luận được', async () => {
    const deps = makeDeps({
      entitlements: {
        getCapability: jest.fn(async () => ({ allowed: false })),
      },
    });

    await expect(deps.useCase.handle(command)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // Chặn TRƯỚC cả trần tốc độ: người không được bình luận thì không tiêu một
    // suất nào của người khác, và cũng không lộ ra trần là bao nhiêu.
    expect(deps.throttle.assertWithinLimit).not.toHaveBeenCalled();
    expect(deps.comments.create).not.toHaveBeenCalled();
  });

  it('chạm trần 10 bình luận mỗi phút thì từ chối, không ghi gì', async () => {
    const deps = makeDeps({
      throttle: {
        assertWithinLimit: jest.fn(async (params: { bucket: string }) => {
          if (params.bucket === 'comment')
            throw new TooManyRequestsException(57);
        }),
        registerHit: jest.fn(),
      },
    });

    await expect(deps.useCase.handle(command)).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );

    expect(deps.throttle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'comment',
      key: UserId,
      limit: 10,
    });
    expect(deps.comments.create).not.toHaveBeenCalled();
  });

  it('chạm trần 200 bình luận mỗi ngày cũng từ chối', async () => {
    // Trần phút một mình không đủ: gõ đều mười cái mỗi phút suốt ngày vẫn ra
    // 14.400 bình luận, và mỗi cái là một dòng thật trên bảng tin người khác.
    const deps = makeDeps({
      throttle: {
        assertWithinLimit: jest.fn(async (params: { bucket: string }) => {
          if (params.bucket === 'comment:day')
            throw new TooManyRequestsException(3_600);
        }),
        registerHit: jest.fn(),
      },
    });

    await expect(deps.useCase.handle(command)).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );

    expect(deps.throttle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'comment:day',
      key: UserId,
      limit: 200,
    });
    expect(deps.comments.create).not.toHaveBeenCalled();
  });

  it('hỏi trần NGÀY trước trần PHÚT', async () => {
    // Chạm cả hai mà báo "thử lại sau 57 giây" là nói sai — thật ra còn phải
    // chờ nhiều giờ nữa.
    const deps = makeDeps();

    await deps.useCase.handle(command);

    const buckets = (
      deps.throttle.assertWithinLimit.mock.calls as unknown as [
        { bucket: string },
      ][]
    ).map(([params]) => params.bucket);
    expect(buckets).toEqual(['comment:day', 'comment']);
  });

  it('bình luận bị bộ lọc chặn THẲNG không tiêu mất một suất', async () => {
    // Đếm trước khi ghi là phạt người dùng vì một thứ chưa từng đăng được.
    const deps = makeDeps({
      adminConfig: {
        getConfigValue: jest.fn(async () => [
          { term: 'tudonao', severity: 'BLOCK' },
        ]),
      },
    });

    await expect(
      deps.useCase.handle({ ...command, body: 'tudonao thật' }),
    ).rejects.toBeInstanceOf(ContentBlockedTermsException);

    expect(deps.comments.create).not.toHaveBeenCalled();
    expect(deps.throttle.registerHit).not.toHaveBeenCalled();
  });

  it('ghi xong mới đếm, và cửa sổ đúng một phút', async () => {
    const deps = makeDeps();

    await deps.useCase.handle(command);

    expect(deps.comments.create).toHaveBeenCalled();
    expect(deps.throttle.registerHit).toHaveBeenCalledWith({
      bucket: 'comment',
      key: UserId,
      windowSeconds: 60,
    });
    // Cửa sổ ngày tính từ bình luận ĐẦU TIÊN của đợt, không phải từ 0 giờ.
    expect(deps.throttle.registerHit).toHaveBeenCalledWith({
      bucket: 'comment:day',
      key: UserId,
      windowSeconds: 86_400,
    });

    const createOrder = deps.comments.create.mock.invocationCallOrder[0];
    const countOrder = deps.throttle.registerHit.mock.invocationCallOrder[0];
    expect(countOrder).toBeGreaterThan(createOrder);
  });

  it('bình luận bị đẩy sang chờ duyệt vẫn tiêu một suất', async () => {
    // Nó ĐÃ được ghi vào database, chỉ là đang ẩn. Không đếm thì spam mức
    // REVIEW là một đường vòng quanh trần tốc độ.
    const deps = makeDeps({
      adminConfig: {
        getConfigValue: jest.fn(async () => [
          { term: 'canxemlai', severity: 'REVIEW' },
        ]),
      },
    });

    const result = await deps.useCase.handle({
      ...command,
      body: 'canxemlai nhé',
    });

    expect(result.comment.status).toBe(CommentStatuses.PENDING_REVIEW);
    expect(deps.throttle.registerHit).toHaveBeenCalled();
  });
});
