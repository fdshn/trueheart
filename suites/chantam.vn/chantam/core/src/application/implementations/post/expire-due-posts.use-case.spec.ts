import { IPostRepository } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ExpireDuePostsUseCase } from './expire-due-posts.use-case';

const AuthorA = '11111111-1111-4111-8111-000000000001';
const AuthorB = '22222222-2222-4222-8222-000000000002';
const PostA = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a';
const PostB = 'bbbbbbbb-bbbb-4bbb-8bbb-00000000000b';

/**
 * Mock trả ĐỦ hình của `IExpireDuePostsResult`.
 *
 * Bản trước của file này trả `{ expired: 4 }` kèm một số đếm — thiếu hẳn
 * mảng bài đã hết hạn — và vẫn xanh, vì `closeFor` giả bỏ qua đối số nên không ai
 * đọc tới trường thiếu. Một mock hẹp hơn contract là một phép kiểm đo chính cái
 * mock, không đo mã.
 */
function makeRepository(
  expiredPosts = [
    { postId: PostA, authorId: AuthorA, title: 'Xe đạp cũ' },
    { postId: PostB, authorId: AuthorB, title: 'Bộ sách giáo khoa' },
  ],
) {
  return {
    expireDuePosts: jest.fn(async (_now: Date) => ({
      expired: expiredPosts.length,
      expiredPosts,
    })),
  } as unknown as jest.Mocked<IPostRepository>;
}

/**
 * Dịch vụ đóng yêu cầu treo, dạng giả.
 *
 * Bài đóng lại mà để hàng đợi nguyên thì người xin không bao giờ nhận được câu
 * trả lời, và mỗi yêu cầu treo vẫn ăn một suất trong trần của họ.
 */
function makeCloseOpenRequests() {
  return {
    closeFor: jest.fn(
      async (_params: { postIds: string[]; reason: string }) => 0,
    ),
  };
}

/**
 * Hình lệnh được khai ĐỦ ở đây, không cast ở chỗ đọc.
 *
 * `jest.fn(async (_command: { userId: string }) => ...)` làm `mock.calls` chỉ biết
 * `userId`, nên mọi phép kiểm đọc `body` phải `as` — và một `as` ở chỗ đọc là chỗ
 * che mất đúng thứ đang kiểm.
 */
interface IDispatchedCommand {
  userId: string;
  type: string;
  title: string;
  body: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
}

function makeDispatch(error?: unknown) {
  return {
    handle: error
      ? jest.fn(async (_command: IDispatchedCommand) => {
          throw error;
        })
      : jest.fn(async (_command: IDispatchedCommand) => undefined),
  };
}

function build(
  repository = makeRepository(),
  close = makeCloseOpenRequests(),
  dispatch = makeDispatch(),
) {
  return {
    useCase: new ExpireDuePostsUseCase(
      repository,
      close as never,
      dispatch as never,
    ),
    repository,
    close,
    dispatch,
  };
}

describe('ExpireDuePostsUseCase', () => {
  it('trả về số bài đã đóng — Rao vặt hết hạn như mọi bài, không còn số chuyển loại', async () => {
    const { useCase } = build();

    const result = await useCase.handle({});

    expect(result).toMatchObject({ expired: 2 });
    expect(result).not.toHaveProperty('convertedToOffer');
  });

  it('mặc định lấy thời điểm hiện tại', async () => {
    const { useCase, repository } = build();
    const before = Date.now();

    await useCase.handle({});

    const [now] = repository.expireDuePosts.mock.calls[0];
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('dùng mốc thời gian được bơm vào khi có', async () => {
    const { useCase, repository } = build();
    const pinned = new Date(2026, 5, 1);

    await useCase.handle({ now: pinned });

    expect(repository.expireDuePosts).toHaveBeenCalledWith(pinned);
  });

  it('đóng yêu cầu treo của ĐÚNG những bài vừa hết hạn', async () => {
    const { useCase, close } = build();

    await useCase.handle({});

    expect(close.closeFor).toHaveBeenCalledWith({
      postIds: [PostA, PostB],
      reason: 'Bài đăng đã hết hạn,',
    });
  });

  it('báo cho CHỦ BÀI từng bài một (CHỐT-10)', async () => {
    // Tới 11/10 chủ bài được nhắc trước 7 ngày rồi không ai nói gì nữa, nên người
    // không mở app trong tuần đó chỉ thấy bài mình biến khỏi feed.
    const { useCase, dispatch } = build();

    await useCase.handle({});

    expect(dispatch.handle).toHaveBeenCalledTimes(2);
    expect(dispatch.handle.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        userId: AuthorA,
        type: NotificationTypes.POST_EXPIRED,
        referenceId: PostA,
        idempotencyKey: `POST_EXPIRED:${PostA}`,
      }),
      expect.objectContaining({
        userId: AuthorB,
        type: NotificationTypes.POST_EXPIRED,
        referenceId: PostB,
        idempotencyKey: `POST_EXPIRED:${PostB}`,
      }),
    ]);
  });

  it('nội dung nói rõ là vẫn gia hạn được', async () => {
    // Bài `EXPIRED` vẫn gia hạn được một lần — thông báo mà không nói điều đó thì
    // người ta nghĩ bài mất rồi và đăng lại từ đầu, tốn một suất quota.
    const { useCase, dispatch } = build();

    await useCase.handle({});

    const body = dispatch.handle.mock.calls[0][0].body;
    expect(body).toContain('Xe đạp cũ');
    expect(body).toContain('gia hạn');
  });

  it('một lượt báo hỏng KHÔNG làm job dừng giữa danh sách', async () => {
    // Một `authorId` đã xoá tài khoản, hay một lượt đẩy hỏng, không được bỏ sót
    // những bài còn lại. Trạng thái `EXPIRED` đã commit nên lượt chạy sau sẽ
    // KHÔNG nhặt lại — tức một thông báo mất là mất hẳn, và đó vẫn là cái giá
    // đúng so với việc để một nửa danh sách không được báo.
    const dispatch = makeDispatch(new Error('người dùng đã xoá'));
    const { useCase } = build(
      makeRepository(),
      makeCloseOpenRequests(),
      dispatch,
    );

    await expect(useCase.handle({})).resolves.toMatchObject({ expired: 2 });
    expect(dispatch.handle).toHaveBeenCalledTimes(2);
  });

  it('không có bài nào hết hạn thì không gọi gì cả', async () => {
    const { useCase, close, dispatch } = build(makeRepository([]));

    await useCase.handle({});

    expect(close.closeFor).toHaveBeenCalledWith({
      postIds: [],
      reason: 'Bài đăng đã hết hạn,',
    });
    expect(dispatch.handle).not.toHaveBeenCalled();
  });
});
