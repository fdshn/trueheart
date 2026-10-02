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
  authors: Array<Record<string, unknown>> = [],
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
          categoryMatchRequired?: boolean;
          radiusMeters: number;
          take: number;
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
    users: {
      findByGlobalIds: jest.fn(async (_ids: string[]) => authors),
    },
    // Dấu `/` cuối là chuyện thường trong cấu hình; ghép thô sẽ ra `//`.
    config: {
      geo: { jitterRadiusMeters: 300 },
      storage: { publicBaseUrl: 'https://cdn.chantam.vn/' },
    },
    // `null` = chưa Admin nào publish `allocation.policy`. Mặc định của mock này
    // là trạng thái thật của hệ sau khi triển khai, nên mọi phép kiểm cũ trong file
    // chứng minh luôn một điều: bản cấu hình hoá KHÔNG đổi hành vi khi chưa publish.
    adminConfig: {
      getConfigValue: jest.fn(async (_key: string) => allocationPolicy),
    },
    entitlements: {
      getCapability: jest.fn(async (_userId: string, _code: string) =>
        rankRadiusMeters === null
          ? null
          : { allowed: true, limit: rankRadiusMeters },
      ),
    },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new GetSmartMatchesUseCase(
    deps.posts as never,
    deps.media as never,
    deps.users as never,
    deps.config as never,
    deps.adminConfig as never,
    deps.entitlements as never,
  );
}

const Command = { postId: SourceId, userId: AuthorId };

/**
 * Chính sách và hạn mức hạng dùng cho lượt gọi kế tiếp.
 *
 * `null` ở cả hai = trạng thái sau khi triển khai nhưng chưa ai publish, tức đúng
 * hành vi có từ trước. `beforeEach` đặt lại để một phép kiểm đổi chính sách không
 * làm lệch phép kiểm sau nó.
 */
let allocationPolicy: unknown = null;
let rankRadiusMeters: number | null = null;

beforeEach(() => {
  allocationPolicy = null;
  rankRadiusMeters = null;
});

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

  it('chỉ hỏi tác giả cho bài thật sự trả về, và khử trùng id', async () => {
    const shared = '60000000-0000-4000-8000-000000000006';
    const deps = makeDeps(
      sourcePost(),
      [
        candidate({
          post: {
            globalId: 'a',
            categoryId: CategoryId,
            location: {},
            authorId: shared,
          },
          distanceMeters: 100,
        }),
        candidate({
          post: {
            globalId: 'b',
            categoryId: CategoryId,
            location: {},
            authorId: shared,
          },
          distanceMeters: 200,
        }),
        candidate({
          post: {
            globalId: 'c',
            categoryId: CategoryId,
            location: {},
            authorId: '70000000-0000-4000-8000-000000000007',
          },
          distanceMeters: 300,
        }),
      ],
      [],
      [
        {
          globalId: shared,
          username: 'sondeptrai',
          avatarUrl: null,
          rank: 'MEMBER',
          createdAt: new Date('2026-09-17T17:59:10.190Z'),
        },
      ],
    );

    const result = await makeUseCase(deps).handle({ ...Command, take: 2 });

    // Hai bài lọt vào kết quả cùng một tác giả, và bài 'c' đã bị cắt — không
    // được hỏi tới nó.
    expect(deps.users.findByGlobalIds).toHaveBeenCalledTimes(1);
    expect(deps.users.findByGlobalIds).toHaveBeenCalledWith([shared]);
    expect(result.matches[0].author?.username).toBe('sondeptrai');
    expect(result.matches[1].author?.username).toBe('sondeptrai');
  });

  it('không có bài ghép nào thì không hỏi tác giả', async () => {
    const deps = makeDeps(sourcePost({ postType: PostTypes.CHARITY }));

    await makeUseCase(deps).handle(Command);

    expect(deps.users.findByGlobalIds).not.toHaveBeenCalled();
  });

  it('mất hàng user thì author là null', async () => {
    const deps = makeDeps();

    const result = await makeUseCase(deps).handle(Command);

    expect(result.matches[0].author).toBeNull();
  });
  describe('allocation.policy đổi hành vi thật', () => {
    it('chưa publish thì truyền categoryMatchRequired false và vẫn có từ khoá', async () => {
      const deps = makeDeps();

      await makeUseCase(deps).handle(Command);

      const params = deps.posts.findSmartMatches.mock.calls[0][0];
      expect(params.categoryMatchRequired).toBe(false);
      expect(params.keywords.length).toBeGreaterThan(0);
      expect(params.radiusMeters).toBe(20_000);
      expect(params.take).toBe(20);
    });

    it('categoryMatchRequired đi xuống repository', async () => {
      allocationPolicy = { categoryMatchRequired: true };
      const deps = makeDeps();

      await makeUseCase(deps).handle(Command);

      expect(
        deps.posts.findSmartMatches.mock.calls[0][0].categoryMatchRequired,
      ).toBe(true);
    });

    it('tắt từ khoá thì KHÔNG gửi token nào xuống truy vấn', async () => {
      // Tắt cả hai bị `allocationPolicyGaps` chặn ở đường publish, nên ca hợp lệ
      // duy nhất của `keywordMatchEnabled: false` là kèm `categoryMatchRequired`.
      allocationPolicy = {
        categoryMatchRequired: true,
        keywordMatchEnabled: false,
      };
      const deps = makeDeps();

      await makeUseCase(deps).handle(Command);

      expect(deps.posts.findSmartMatches.mock.calls[0][0].keywords).toEqual([]);
    });

    it('maxSuggestions chặn trên được cả giá trị client gửi', async () => {
      allocationPolicy = { maxSuggestions: 1 };
      const deps = makeDeps();

      const result = await makeUseCase(deps).handle({ ...Command, take: 50 });

      expect(deps.posts.findSmartMatches.mock.calls[0][0].take).toBe(1);
      expect(result.matches).toHaveLength(1);
    });

    it('FILTER_ONLY không hỏi hạn mức hạng', async () => {
      // Một truy vấn capability mỗi lượt gợi ý cho giá trị không ai đọc là tốn vô
      // ích, và `FILTER_ONLY` là mặc định nên đó là mọi lượt gọi.
      rankRadiusMeters = 45_000;
      const deps = makeDeps();

      await makeUseCase(deps).handle(Command);

      expect(deps.entitlements.getCapability).not.toHaveBeenCalled();
      expect(deps.posts.findSmartMatches.mock.calls[0][0].radiusMeters).toBe(
        20_000,
      );
    });

    it('RANK_ONLY lấy bán kính theo hạng, bỏ qua bán kính client gửi', async () => {
      allocationPolicy = { distanceRule: 'RANK_ONLY' };
      rankRadiusMeters = 45_000;
      const deps = makeDeps();

      await makeUseCase(deps).handle({ ...Command, radiusMeters: 1_000 });

      expect(deps.entitlements.getCapability).toHaveBeenCalled();
      expect(deps.posts.findSmartMatches.mock.calls[0][0].radiusMeters).toBe(
        45_000,
      );
    });

    it('RANK_ONLY thiếu capability thì lùi về bán kính client, không về 0', async () => {
      allocationPolicy = { distanceRule: 'RANK_ONLY' };
      rankRadiusMeters = null;
      const deps = makeDeps();

      await makeUseCase(deps).handle({ ...Command, radiusMeters: 1_000 });

      expect(deps.posts.findSmartMatches.mock.calls[0][0].radiusMeters).toBe(
        1_000,
      );
    });

    it('RANK_OR_FILTER lấy cái nới hơn', async () => {
      allocationPolicy = { distanceRule: 'RANK_OR_FILTER' };
      rankRadiusMeters = 45_000;
      const deps = makeDeps();

      await makeUseCase(deps).handle({ ...Command, radiusMeters: 1_000 });

      expect(deps.posts.findSmartMatches.mock.calls[0][0].radiusMeters).toBe(
        45_000,
      );
    });

    it('bán kính theo hạng vẫn bị kẹp vào trần kỹ thuật 50km', async () => {
      // Hạn mức hạng là dữ liệu Admin nhập; nới quá trần truy vấn là quét cả nước.
      allocationPolicy = { distanceRule: 'RANK_ONLY' };
      rankRadiusMeters = 900_000;
      const deps = makeDeps();

      await makeUseCase(deps).handle(Command);

      expect(deps.posts.findSmartMatches.mock.calls[0][0].radiusMeters).toBe(
        50_000,
      );
    });

    it('trọng số của Admin đổi được THỨ TỰ gợi ý', async () => {
      // Hai ứng viên cố ý ngược nhau: một bài SÁT BÊN nhưng sai danh mục và không
      // trùng từ khoá, một bài XA nhưng khớp cả hai. Bộ trọng số nào thắng thì thấy
      // ngay ở bài nào lên đầu — mạnh hơn hẳn việc so hai con số điểm, vì điểm có
      // thể lệch vài phần nghìn mà thứ tự vẫn y nguyên.
      const near = candidate({
        post: {
          globalId: '50000000-0000-4000-8000-00000000000a',
          categoryId: CategoryId,
          location: { lat: 10.78, lng: 106.7 },
        },
        distanceMeters: 100,
        sameCategory: false,
        keywordMatched: false,
      });
      const farButMatching = candidate({
        post: {
          globalId: '50000000-0000-4000-8000-00000000000b',
          categoryId: CategoryId,
          location: { lat: 10.9, lng: 106.9 },
        },
        distanceMeters: 19_000,
        sameCategory: true,
        keywordMatched: true,
      });

      // Mặc định: khớp danh mục + từ khoá (0,8) thắng khoảng cách (0,2 × 0,995).
      const baseline = await makeUseCase(
        makeDeps(sourcePost(), [near, farButMatching]),
      ).handle(Command);
      expect(baseline.matches[0].post.globalId).toBe(
        farButMatching.post.globalId,
      );

      // Dồn hết sang khoảng cách: bài sát bên lên đầu dù sai danh mục.
      allocationPolicy = {
        weights: { sameCategory: 0, keyword: 0, proximity: 1 },
      };
      const tuned = await makeUseCase(
        makeDeps(sourcePost(), [near, farButMatching]),
      ).handle(Command);
      expect(tuned.matches[0].post.globalId).toBe(near.post.globalId);
    });
  });
});
