import {
  GiftPostStatuses,
  PostTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import { GetMyPostsUseCase } from './get-my-posts.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';
const OtherUserId = '20000000-0000-4000-8000-000000000002';

function makeDeps(items: unknown[] = [], total = 0) {
  return {
    posts: {
      findMyPosts: jest.fn(
        async (_params: {
          authorId: string;
          postType?: PostTypes;
          status?: string;
          categoryId?: string;
          skip: number;
          take: number;
        }) => ({ items, total }),
      ),
    },
    postMedia: {
      listByPostId: jest.fn().mockResolvedValue([]),
      listByPostIds: jest.fn().mockResolvedValue([]),
    },
    giftRequests: {
      countActiveByPostIds: jest
        .fn()
        .mockResolvedValue(new Map<string, number>()),
    },
    reactions: {
      findMyReactions: jest
        .fn()
        .mockResolvedValue(new Map<string, ReactionKinds>()),
    },
    config: {
      storage: {
        publicBaseUrl: 'https://cdn.chantam.vn',
      },
    },
  };
}

function run(deps: ReturnType<typeof makeDeps>, command: unknown) {
  return new GetMyPostsUseCase(
    deps.posts as never,
    deps.postMedia as never,
    deps.giftRequests as never,
    deps.reactions as never,
    deps.config as never,
  ).handle(command as never);
}

describe('GetMyPostsUseCase', () => {
  it('lấy tác giả từ token, không tin authorId gửi lên', async () => {
    // Tin vào query là ai cũng đọc được bài chờ duyệt và bài bị từ chối của
    // người khác chỉ bằng cách đổi một tham số.
    const deps = makeDeps();

    await run(deps, { userId: UserId, authorId: OtherUserId });

    expect(deps.posts.findMyPosts.mock.calls[0][0].authorId).toBe(UserId);
  });

  it('truyền đủ bộ lọc loại bài, trạng thái và danh mục', async () => {
    const deps = makeDeps();

    await run(deps, {
      userId: UserId,
      postType: PostTypes.CLASSIFIED,
      status: GiftPostStatuses.PENDING_REVIEW,
      categoryId: 'cat-1',
    });

    const params = deps.posts.findMyPosts.mock.calls[0][0];
    expect(params.postType).toBe(PostTypes.CLASSIFIED);
    expect(params.status).toBe(GiftPostStatuses.PENDING_REVIEW);
    expect(params.categoryId).toBe('cat-1');
  });

  it('không tự lọc trạng thái khi người gọi không nêu', async () => {
    // Mặc định phải thấy cả bài chờ duyệt lẫn bài bị từ chối — đó là lý do
    // endpoint này tồn tại tách khỏi discovery công khai.
    const deps = makeDeps();

    await run(deps, { userId: UserId });

    expect(deps.posts.findMyPosts.mock.calls[0][0].status).toBeUndefined();
  });

  it('trả toạ độ thật, không làm nhiễu', async () => {
    // Bài của chính mình: chủ bài cần thấy đúng chỗ đã ghim để sửa cho khớp.
    const location = { lat: 10.7724, lng: 106.698 };
    const deps = makeDeps(
      [
        {
          globalId: 'p1',
          location,
          reactionCount: 0,
          commentCount: 0,
          shareCount: 0,
        },
      ],
      1,
    );

    const result = await run(deps, { userId: UserId });

    expect(result.posts[0].post.location).toEqual(location);
  });

  it('phân trang theo meta', async () => {
    const deps = makeDeps([], 42);

    const result = await run(deps, { userId: UserId, page: 2, pageSize: 20 });

    expect(result.meta).toMatchObject({ page: 2, pageSize: 20, total: 42 });
  });

  it('nhúng số đếm và myReaction, lấy cảm xúc bằng một truy vấn cho cả trang', async () => {
    const deps = makeDeps(
      [
        {
          globalId: 'p1',
          location: { lat: 1, lng: 2 },
          reactionCount: 4,
          commentCount: 1,
          shareCount: 2,
        },
        {
          globalId: 'p2',
          location: { lat: 3, lng: 4 },
          reactionCount: 0,
          commentCount: 0,
          shareCount: 0,
        },
      ],
      2,
    );
    deps.reactions.findMyReactions.mockResolvedValue(
      new Map([['p1', ReactionKinds.WOW]]),
    );

    const result = await run(deps, { userId: UserId });

    expect(deps.reactions.findMyReactions).toHaveBeenCalledWith('POST', [
      'p1',
      'p2',
    ], UserId);
    expect(result.posts[0]).toMatchObject({
      reactionCount: 4,
      commentCount: 1,
      shareCount: 2,
      myReaction: ReactionKinds.WOW,
    });
    expect(result.posts[1].myReaction).toBeNull();
  });
});
