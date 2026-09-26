import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { GetSmartMatchesUseCase } from './get-smart-matches.use-case';

const AuthorId = '10000000-0000-4000-8000-000000000001';
const StrangerId = '20000000-0000-4000-8000-000000000002';
const SourceId = '30000000-0000-4000-8000-000000000003';
const CategoryId = '40000000-0000-4000-8000-000000000004';

function sourcePost(overrides: Record<string, unknown> = {}) {
  return {
    globalId: SourceId,
    authorId: AuthorId,
    categoryId: CategoryId,
    postType: PostTypes.WANTED,
    title: 'Cần xe đạp cho bé',
    location: { lat: 10.7724, lng: 106.698 },
    deletedAt: null,
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    post: {
      globalId: '50000000-0000-4000-8000-000000000005',
      categoryId: CategoryId,
      location: { lat: 10.78, lng: 106.7 },
    },
    distanceMeters: 100,
    sameCategory: true,
    keywordMatched: true,
    ...overrides,
  };
}

function makeDeps(
  source: unknown = sourcePost(),
  candidates: unknown[] = [candidate()],
  mediaItems: Array<Record<string, unknown>> = [],
) {
  return {
    posts: {
      findOneBy: jest.fn(async () => source),
      // Khai báo tham số để `mock.calls` có kiểu; thiếu nó thì TypeScript coi
      // đây là tuple rỗng và không truy cập được phần tử nào.
      findSmartMatches: jest.fn(
        async (_params: {
          postType: string;
          excludeAuthorId: string;
          sourcePostId: string;
          keywords: string[];
        }) => candidates,
      ),
      // Có mặt để test chứng minh được là KHÔNG bị gọi.
      createPostWithinQuota: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    },
    media: {
      // Trả phẳng mọi bài như `listByPostIds` thật, để test bắt được lỗi gom
      // nhầm ảnh sang bài khác.
      listByPostIds: jest.fn(async (_postIds: string[]) => mediaItems),
    },
    // Dấu `/` cuối là chuyện thường trong cấu hình; ghép thô sẽ ra `//`.
    config: {
      geo: { jitterRadiusMeters: 300 },
      storage: { publicBaseUrl: 'https://cdn.chantam.vn/' },
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new GetSmartMatchesUseCase(
    deps.posts as never,
    deps.media as never,
    deps.config as never,
  );
}

const Command = { postId: SourceId, userId: AuthorId };

describe('GetSmartMatchesUseCase', () => {
  it('ghép Muốn Nhận với Muốn Tặng', async () => {
    const deps = makeDeps();

    await makeUseCase(deps).handle(Command);

    const params = deps.posts.findSmartMatches.mock.calls[0][0];
    expect(params.postType).toBe(PostTypes.OFFER);
  });

  it('ghép Muốn Tặng với Muốn Nhận', async () => {
    const deps = makeDeps(sourcePost({ postType: PostTypes.OFFER }));

    await makeUseCase(deps).handle(Command);

    const params = deps.posts.findSmartMatches.mock.calls[0][0];
    expect(params.postType).toBe(PostTypes.WANTED);
  });

  it('KHÔNG tạo giao dịch — chỉ đọc', async () => {
    // F17 nói rõ: Smart Match chỉ gợi ý, quyết định cuối thuộc về con người.
    const deps = makeDeps();

    await makeUseCase(deps).handle(Command);

    expect(deps.posts.createPostWithinQuota).not.toHaveBeenCalled();
    expect(deps.posts.update).not.toHaveBeenCalled();
    expect(deps.posts.save).not.toHaveBeenCalled();
  });

  it('người ngoài không xem được gợi ý của bài người khác', async () => {
    // Vị trí THẬT của bài nguồn là tâm truy vấn; mở cho người ngoài là biến
    // endpoint này thành đường vòng để dò toạ độ chính xác.
    const deps = makeDeps();

    await expect(
      makeUseCase(deps).handle({ ...Command, userId: StrangerId }),
    ).rejects.toThrow();
    expect(deps.posts.findSmartMatches).not.toHaveBeenCalled();
  });

  it('bài đã xoá thì báo không tìm thấy', async () => {
    const deps = makeDeps(sourcePost({ deletedAt: new Date() }));

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();
    expect(deps.posts.findSmartMatches).not.toHaveBeenCalled();
  });

  it('loại bài không có khái niệm ghép đôi thì trả rỗng, không ghép bừa', async () => {
    const deps = makeDeps(sourcePost({ postType: PostTypes.CHARITY }));

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches).toEqual([]);
    expect(deps.posts.findSmartMatches).not.toHaveBeenCalled();
  });

  it('không gợi ý bài của chính tác giả', async () => {
    const deps = makeDeps();

    await makeUseCase(deps).handle(Command);

    const params = deps.posts.findSmartMatches.mock.calls[0][0];
    expect(params.excludeAuthorId).toBe(AuthorId);
    expect(params.sourcePostId).toBe(SourceId);
  });

  it('truyền từ khoá đã làm sạch từ tiêu đề bài nguồn', async () => {
    const deps = makeDeps();

    await makeUseCase(deps).handle(Command);

    const params = deps.posts.findSmartMatches.mock.calls[0][0];
    expect(params.keywords).toEqual(['cần', 'xe', 'đạp', 'bé']);
  });

  it('xếp khớp cao lên trước, bằng điểm thì gần hơn lên trước', async () => {
    const deps = makeDeps(sourcePost(), [
      candidate({
        post: { globalId: 'xa', categoryId: CategoryId, location: {} },
        sameCategory: true,
        keywordMatched: false,
        distanceMeters: 900,
      }),
      candidate({
        post: { globalId: 'khop-nhat', categoryId: CategoryId, location: {} },
        sameCategory: true,
        keywordMatched: true,
        distanceMeters: 800,
      }),
      candidate({
        post: { globalId: 'gan', categoryId: CategoryId, location: {} },
        sameCategory: true,
        keywordMatched: false,
        distanceMeters: 100,
      }),
    ]);

    const result = await makeUseCase(deps).handle({
      ...Command,
      radiusMeters: 1000,
    });

    expect(result.matches.map((match) => match.post.globalId)).toEqual([
      'khop-nhat',
      'gan',
      'xa',
    ]);
  });

  it('làm tròn khoảng cách và làm nhiễu toạ độ trước khi trả ra', async () => {
    // Trả mét chính xác cộng toạ độ thật là đủ để tam giác đạc ra nhà người ta.
    const deps = makeDeps(sourcePost(), [candidate({ distanceMeters: 137 })]);

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches[0].distanceMeters).not.toBe(137);
    expect(result.matches[0].isLocationApproximate).toBe(true);
  });

  it('cắt đúng số lượng yêu cầu', async () => {
    const deps = makeDeps(sourcePost(), [
      candidate({
        post: { globalId: 'a', categoryId: CategoryId, location: {} },
      }),
      candidate({
        post: { globalId: 'b', categoryId: CategoryId, location: {} },
      }),
      candidate({
        post: { globalId: 'c', categoryId: CategoryId, location: {} },
      }),
    ]);

    const result = await makeUseCase(deps).handle({ ...Command, take: 2 });

    expect(result.matches).toHaveLength(2);
  });

  it('chỉ hỏi ảnh cho bài thật sự trả về, không hỏi cho bài đã bị cắt', async () => {
    // Nạp ảnh trước khi cắt là kéo về đúng thứ vừa quyết không trả.
    const deps = makeDeps(sourcePost(), [
      candidate({
        post: { globalId: 'a', categoryId: CategoryId, location: {} },
        distanceMeters: 100,
      }),
      candidate({
        post: { globalId: 'b', categoryId: CategoryId, location: {} },
        distanceMeters: 200,
      }),
      candidate({
        post: { globalId: 'c', categoryId: CategoryId, location: {} },
        distanceMeters: 300,
      }),
    ]);

    await makeUseCase(deps).handle({ ...Command, take: 2 });

    expect(deps.media.listByPostIds).toHaveBeenCalledTimes(1);
    expect(deps.media.listByPostIds).toHaveBeenCalledWith(['a', 'b']);
  });

  it('gắn ảnh vào đúng bài và sắp theo sortOrder', async () => {
    const deps = makeDeps(
      sourcePost(),
      [
        candidate({
          post: { globalId: 'a', categoryId: CategoryId, location: {} },
          distanceMeters: 100,
        }),
        candidate({
          post: { globalId: 'b', categoryId: CategoryId, location: {} },
          distanceMeters: 200,
        }),
      ],
      [
        { id: 9, postId: 'b', r2Key: 'posts/b-1.webp', sortOrder: 0 },
        { id: 7, postId: 'a', r2Key: 'posts/a-2.webp', sortOrder: 1 },
        { id: 5, postId: 'a', r2Key: 'posts/a-1.webp', sortOrder: 0 },
      ],
    );

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches[0].media).toEqual([
      { id: 5, url: 'https://cdn.chantam.vn/posts/a-1.webp', sortOrder: 0 },
      { id: 7, url: 'https://cdn.chantam.vn/posts/a-2.webp', sortOrder: 1 },
    ]);
    expect(result.matches[1].media).toEqual([
      { id: 9, url: 'https://cdn.chantam.vn/posts/b-1.webp', sortOrder: 0 },
    ]);
  });

  it('bài không có ảnh thì trả mảng rỗng, không phải undefined', async () => {
    const deps = makeDeps();

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches[0].media).toEqual([]);
  });

  it('không có bài ghép nào thì không hỏi ảnh', async () => {
    const deps = makeDeps(sourcePost({ postType: PostTypes.CHARITY }));

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches).toEqual([]);
    expect(deps.media.listByPostIds).not.toHaveBeenCalled();
  });
});
