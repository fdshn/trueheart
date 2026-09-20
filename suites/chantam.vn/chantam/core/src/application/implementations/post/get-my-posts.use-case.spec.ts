import {
  GiftPostStatuses,
  PostTypes,
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
  };
}

function run(deps: ReturnType<typeof makeDeps>, command: unknown) {
  return new GetMyPostsUseCase(deps.posts as never).handle(command as never);
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
    const deps = makeDeps([{ globalId: 'p1', location }], 1);

    const result = await run(deps, { userId: UserId });

    expect(result.posts[0].location).toEqual(location);
  });

  it('phân trang theo meta', async () => {
    const deps = makeDeps([], 42);

    const result = await run(deps, { userId: UserId, page: 2, pageSize: 20 });

    const params = deps.posts.findMyPosts.mock.calls[0][0];
    expect(params.skip).toBe(20);
    expect(params.take).toBe(20);
    expect(result.meta.total).toBe(42);
  });

  it('tôn trọng pageSize thay vì rơi về mặc định', async () => {
    // Tham số của repo tên là `pageSize`. Đặt nhầm thành `limit` thì nó bị bỏ
    // qua âm thầm và mọi trang đều trả về đúng 20 bản ghi mặc định.
    const deps = makeDeps([], 42);

    await run(deps, { userId: UserId, page: 3, pageSize: 5 });

    const params = deps.posts.findMyPosts.mock.calls[0][0];
    expect(params.take).toBe(5);
    expect(params.skip).toBe(10);
  });
});
