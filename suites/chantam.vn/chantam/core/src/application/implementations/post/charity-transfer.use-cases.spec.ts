import {
  PostCharityTransferInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { CharityTransferStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  RequestCharityTransferUseCase,
  ReviewCharityTransferUseCase,
} from './charity-transfer.use-cases';

const AuthorId = 'author-1';
const AdminId = 'admin-1';
const PostId = '20000000-0000-4000-8000-000000000001';
const Post = { globalId: PostId, status: 'ARCHIVED' };

type Outcome =
  | { status: 'RECORDED'; post: unknown }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_STATE' };

const recorded: Outcome = { status: 'RECORDED', post: Post };

describe('RequestCharityTransferUseCase', () => {
  function makePosts(outcome: Outcome = recorded) {
    return {
      requestCharityTransfer: jest.fn(async (_params: unknown) => outcome),
    };
  }

  it('gửi đúng chủ bài và ghi chú xuống repository, trả về bài', async () => {
    const posts = makePosts();

    const result = await new RequestCharityTransferUseCase(
      posts as never,
    ).handle({
      userId: AuthorId,
      postId: PostId,
      transfer: { note: 'gửi chùa gần nhà' },
    });

    expect(posts.requestCharityTransfer).toHaveBeenCalledWith({
      postId: PostId,
      authorId: AuthorId,
      note: 'gửi chùa gần nhà',
    });
    expect(result).toEqual({ post: Post });
  });

  it('không có ghi chú thì gửi null, không phải undefined', async () => {
    const posts = makePosts();

    await new RequestCharityTransferUseCase(posts as never).handle({
      userId: AuthorId,
      postId: PostId,
      transfer: {},
    });

    expect(posts.requestCharityTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it('bài của người khác hoặc không có thật đều là 404 — không cho dò id', async () => {
    const posts = makePosts({ status: 'NOT_FOUND' });

    await expect(
      new RequestCharityTransferUseCase(posts as never).handle({
        userId: 'stranger',
        postId: PostId,
        transfer: {},
      }),
    ).rejects.toThrow(PostNotFoundException);
  });

  it('đã xin rồi hoặc bài không ở trạng thái xin được thì lỗi trạng thái', async () => {
    const posts = makePosts({ status: 'INVALID_STATE' });

    await expect(
      new RequestCharityTransferUseCase(posts as never).handle({
        userId: AuthorId,
        postId: PostId,
        transfer: {},
      }),
    ).rejects.toThrow(PostCharityTransferInvalidStateException);
  });
});

describe('ReviewCharityTransferUseCase', () => {
  function makeDeps(options: { granted?: boolean; outcome?: Outcome } = {}) {
    return {
      posts: {
        reviewCharityTransfer: jest.fn(
          async (_params: unknown) => options.outcome ?? recorded,
        ),
      },
      admin: { hasPermission: jest.fn(async () => options.granted ?? true) },
    };
  }

  const build = (deps: ReturnType<typeof makeDeps>) =>
    new ReviewCharityTransferUseCase(deps.posts as never, deps.admin as never);

  it('đòi post.moderate — thiếu quyền thì Forbidden và không ghi', async () => {
    const deps = makeDeps({ granted: false });

    await expect(
      build(deps).handle({
        userId: AuthorId,
        postId: PostId,
        transfer: { status: CharityTransferStatuses.APPROVED },
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      AuthorId,
      'post.moderate',
    );
    expect(deps.posts.reviewCharityTransfer).not.toHaveBeenCalled();
  });

  it.each([
    [CharityTransferStatuses.APPROVED as const, true],
    [CharityTransferStatuses.REJECTED as const, false],
  ])('%s thì approve=%s', async (status, approve) => {
    const deps = makeDeps();

    const result = await build(deps).handle({
      userId: AdminId,
      postId: PostId,
      transfer: { status },
    });

    expect(deps.posts.reviewCharityTransfer).toHaveBeenCalledWith({
      postId: PostId,
      approve,
    });
    expect(result).toEqual({ post: Post });
  });

  it('không có yêu cầu đang chờ (đã duyệt rồi, bấm lại) thì lỗi trạng thái', async () => {
    const deps = makeDeps({ outcome: { status: 'INVALID_STATE' } });

    await expect(
      build(deps).handle({
        userId: AdminId,
        postId: PostId,
        transfer: { status: CharityTransferStatuses.APPROVED },
      }),
    ).rejects.toThrow(PostCharityTransferInvalidStateException);
  });

  it('bài không có thì 404', async () => {
    const deps = makeDeps({ outcome: { status: 'NOT_FOUND' } });

    await expect(
      build(deps).handle({
        userId: AdminId,
        postId: PostId,
        transfer: { status: CharityTransferStatuses.REJECTED },
      }),
    ).rejects.toThrow(PostNotFoundException);
  });
});
