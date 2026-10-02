import { BlogCategoryLabels } from '@chantam.vn/chantam.core-lib/models';
import {
  CreateBlogUseCase,
  DeleteBlogUseCase,
  GetPublicBlogUseCase,
  ListAdminBlogsUseCase,
  ListPublicBlogsUseCase,
  UpdateBlogUseCase,
} from './blog.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const BlogId = '20000000-0000-4000-8000-000000000002';

/**
 * Bộ lọc giả, KHÔNG dùng `sanitize-html` thật.
 *
 * Spec của bộ lọc thật nằm ở `sanitize-html.sanitizer.spec.ts` với 22 ca tấn công. Ở đây
 * chỉ cần một bộ lọc *có hành vi đúng về mặt hợp đồng* để kiểm thứ tự "lọc trước, kiểm
 * sau" — mock nó cho phép dựng đúng ca khó nhất: nội dung gửi lên có chữ, mà lọc xong thì
 * rỗng.
 */
function makeSanitizer(overrides: { stripAll?: boolean } = {}) {
  return {
    sanitizeArticle: jest.fn((raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      return overrides.stripAll
        ? ''
        : raw.replace(/<script[\s\S]*?<\/script>/g, '');
    }),
    textLength: jest.fn(
      (html: string): number => html.replace(/<[^>]*>/g, '').trim().length,
    ),
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    globalId: BlogId,
    title: 'Tâm Từ',
    slug: 'tam-tu',
    category: 'PHAT_PHAP' as const,
    summary: null,
    contentHtml: '<p>Nội dung</p>',
    thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
    authorId: ActorId,
    viewCount: 0,
    isPublished: true,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(
  options: { slugTaken?: boolean; existing?: unknown; deleted?: boolean } = {},
) {
  return {
    repository: {
      // Khai tham số để `mock.calls` có kiểu; thiếu nó thì TypeScript coi đây là tuple
      // rỗng và không truy cập được phần tử nào.
      listBlogs: jest.fn(
        async (_query: {
          limit: number;
          offset: number;
          category?: string;
          publishedOnly: boolean;
        }) => ({ items: [], total: 0 }),
      ),
      findByGlobalId: jest.fn(async (_id: string) =>
        options.existing === undefined ? record() : options.existing,
      ),
      findPublishedBySlug: jest.fn(async (_slug: string) =>
        options.existing === undefined ? record() : options.existing,
      ),
      slugTaken: jest.fn(
        async (_slug: string, _except?: string): Promise<boolean> =>
          options.slugTaken === true,
      ),
      createBlog: jest.fn(async (params: Record<string, unknown>) =>
        record(params),
      ),
      updateBlog: jest.fn(async (params: Record<string, unknown>) =>
        record(params),
      ),
      softDeleteBlog: jest.fn(
        async (_id: string, _actor: string): Promise<boolean> =>
          options.deleted !== false,
      ),
      incrementViewCount: jest.fn(async (_id: string) => undefined),
    },
    admin: {
      hasPermission: jest.fn(
        async (_userId: string, _code: string): Promise<boolean> => true,
      ),
    },
  };
}

const ValidInput = {
  actorUserId: ActorId,
  title: '  Tâm Từ Và Hạnh Bố Thí  ',
  category: 'PHAT_PHAP' as const,
  summary: '  Tóm tắt  ',
  contentHtml: '<p>Bố thí có ba bậc.</p>',
  thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
  isPublished: true,
};

describe('CreateBlogUseCase', () => {
  it('sinh slug từ tiêu đề và cắt khoảng trắng', async () => {
    const deps = makeDeps();

    await new CreateBlogUseCase(
      deps.repository as never,
      makeSanitizer() as never,
      deps.admin as never,
    ).handle(ValidInput);

    const params = deps.repository.createBlog.mock.calls[0][0];
    expect(params.title).toBe('Tâm Từ Và Hạnh Bố Thí');
    expect(params.slug).toBe('tam-tu-va-hanh-bo-thi');
    expect(params.summary).toBe('Tóm tắt');
  });

  it('slug người dùng gõ cũng bị chuẩn hoá y hệt', async () => {
    const deps = makeDeps();

    await new CreateBlogUseCase(
      deps.repository as never,
      makeSanitizer() as never,
      deps.admin as never,
    ).handle({ ...ValidInput, slug: 'Đồ Dùng Cho Bé!!' });

    expect(deps.repository.createBlog.mock.calls[0][0].slug).toBe(
      'do-dung-cho-be',
    );
  });

  it('LỌC HTML trước khi ghi, và ghi bản đã lọc', async () => {
    const deps = makeDeps();
    const sanitizer = makeSanitizer();

    await new CreateBlogUseCase(
      deps.repository as never,
      sanitizer as never,
      deps.admin as never,
    ).handle({
      ...ValidInput,
      contentHtml: '<p>Chữ</p><script>alert(1)</script>',
    });

    expect(sanitizer.sanitizeArticle).toHaveBeenCalled();
    expect(deps.repository.createBlog.mock.calls[0][0].contentHtml).toBe(
      '<p>Chữ</p>',
    );
  });

  it('lọc TRƯỚC rồi kiểm SAU — nội dung có chữ mà lọc xong rỗng thì bị chặn', async () => {
    // Đây là ca quan trọng nhất của file. Admin dán một đoạn toàn `<script>`: HTML thô
    // có độ dài, lọc xong là rỗng. Kiểm trên dữ liệu thô sẽ thấy "có nội dung" rồi xuất
    // bản một trang trắng.
    const deps = makeDeps();

    await expect(
      new CreateBlogUseCase(
        deps.repository as never,
        makeSanitizer({ stripAll: true }) as never,
        deps.admin as never,
      ).handle({ ...ValidInput, contentHtml: '<script>alert(1)</script>' }),
    ).rejects.toThrow();

    expect(deps.repository.createBlog).not.toHaveBeenCalled();
  });

  it('bản nháp thiếu nội dung và ảnh bìa vẫn lưu được', async () => {
    const deps = makeDeps();

    await new CreateBlogUseCase(
      deps.repository as never,
      makeSanitizer() as never,
      deps.admin as never,
    ).handle({
      actorUserId: ActorId,
      title: 'Bài nháp',
      category: 'SONG_XANH',
      isPublished: false,
    });

    expect(deps.repository.createBlog).toHaveBeenCalled();
  });

  it('xuất bản mà thiếu ảnh bìa https thì bị chặn', async () => {
    const deps = makeDeps();

    await expect(
      new CreateBlogUseCase(
        deps.repository as never,
        makeSanitizer() as never,
        deps.admin as never,
      ).handle({ ...ValidInput, thumbnailUrl: 'http://cdn.chantam.vn/a.webp' }),
    ).rejects.toThrow();

    expect(deps.repository.createBlog).not.toHaveBeenCalled();
  });

  it('slug đã có người dùng thì báo lỗi đọc được, không để UNIQUE ném 500', async () => {
    const deps = makeDeps({ slugTaken: true });

    await expect(
      new CreateBlogUseCase(
        deps.repository as never,
        makeSanitizer() as never,
        deps.admin as never,
      ).handle(ValidInput),
    ).rejects.toThrow();

    expect(deps.repository.createBlog).not.toHaveBeenCalled();
  });

  it('thiếu quyền blog.manage thì không ghi gì', async () => {
    const deps = makeDeps();
    deps.admin.hasPermission.mockResolvedValue(false);

    await expect(
      new CreateBlogUseCase(
        deps.repository as never,
        makeSanitizer() as never,
        deps.admin as never,
      ).handle(ValidInput),
    ).rejects.toThrow();

    expect(deps.repository.createBlog).not.toHaveBeenCalled();
  });

  it('trả về nhãn tiếng Việt kèm mã chuyên mục', async () => {
    const deps = makeDeps();

    const result = await new CreateBlogUseCase(
      deps.repository as never,
      makeSanitizer() as never,
      deps.admin as never,
    ).handle(ValidInput);

    expect(result.categoryLabel).toBe(BlogCategoryLabels.PHAT_PHAP);
  });
});

describe('UpdateBlogUseCase', () => {
  it('không tìm thấy thì 404 trước khi chạm UPDATE', async () => {
    const deps = makeDeps({ existing: null });

    await expect(
      new UpdateBlogUseCase(
        deps.repository as never,
        makeSanitizer() as never,
        deps.admin as never,
      ).handle({ ...ValidInput, blogId: BlogId }),
    ).rejects.toThrow();

    expect(deps.repository.updateBlog).not.toHaveBeenCalled();
  });

  it('kiểm slug trùng BỎ QUA chính bài đang sửa', async () => {
    // Thiếu điều kiện đó thì không ai sửa được bài của mình: slug hiện tại luôn "đã có
    // người dùng" — chính nó.
    const deps = makeDeps();

    await new UpdateBlogUseCase(
      deps.repository as never,
      makeSanitizer() as never,
      deps.admin as never,
    ).handle({ ...ValidInput, blogId: BlogId });

    expect(deps.repository.slugTaken).toHaveBeenCalledWith(
      'tam-tu-va-hanh-bo-thi',
      BlogId,
    );
  });
});

describe('DeleteBlogUseCase', () => {
  it('xoá mềm và trả deleted true', async () => {
    const deps = makeDeps();

    const result = await new DeleteBlogUseCase(
      deps.repository as never,
      deps.admin as never,
    ).handle({ actorUserId: ActorId, blogId: BlogId });

    expect(result.deleted).toBe(true);
    expect(deps.repository.softDeleteBlog).toHaveBeenCalledWith(
      BlogId,
      ActorId,
    );
  });

  it('không có dòng nào bị xoá thì 404', async () => {
    const deps = makeDeps({ deleted: false });

    await expect(
      new DeleteBlogUseCase(
        deps.repository as never,
        deps.admin as never,
      ).handle({ actorUserId: ActorId, blogId: BlogId }),
    ).rejects.toThrow();
  });
});

describe('ListAdminBlogsUseCase / ListPublicBlogsUseCase', () => {
  it('CMS thấy cả bản nháp', async () => {
    const deps = makeDeps();

    await new ListAdminBlogsUseCase(
      deps.repository as never,
      deps.admin as never,
    ).handle({ actorUserId: ActorId, limit: 20, offset: 0 });

    expect(deps.repository.listBlogs.mock.calls[0][0]).toMatchObject({
      publishedOnly: false,
    });
  });

  it('đường công khai CHỈ thấy bài đã xuất bản, và không hỏi quyền', async () => {
    const deps = makeDeps();

    await new ListPublicBlogsUseCase(deps.repository as never).handle({
      limit: 20,
      offset: 0,
    });

    expect(deps.repository.listBlogs.mock.calls[0][0]).toMatchObject({
      publishedOnly: true,
    });
    expect(deps.admin.hasPermission).not.toHaveBeenCalled();
  });
});

describe('GetPublicBlogUseCase', () => {
  it('chuỗi hình UUID thì tra theo id', async () => {
    const deps = makeDeps();

    await new GetPublicBlogUseCase(deps.repository as never).handle({
      idOrSlug: BlogId,
    });

    expect(deps.repository.findByGlobalId).toHaveBeenCalledWith(BlogId);
    expect(deps.repository.findPublishedBySlug).not.toHaveBeenCalled();
  });

  it('chuỗi thường thì tra theo slug', async () => {
    const deps = makeDeps();

    await new GetPublicBlogUseCase(deps.repository as never).handle({
      idOrSlug: 'tam-tu',
    });

    expect(deps.repository.findPublishedBySlug).toHaveBeenCalledWith('tam-tu');
    expect(deps.repository.findByGlobalId).not.toHaveBeenCalled();
  });

  it('tra bằng id một BẢN NHÁP vẫn trả 404 — nháp không được lọt ra đường công khai', async () => {
    const deps = makeDeps({ existing: record({ isPublished: false }) });

    await expect(
      new GetPublicBlogUseCase(deps.repository as never).handle({
        idOrSlug: BlogId,
      }),
    ).rejects.toThrow();

    expect(deps.repository.incrementViewCount).not.toHaveBeenCalled();
  });

  it('không tìm thấy thì 404 và không đếm lượt xem', async () => {
    const deps = makeDeps({ existing: null });

    await expect(
      new GetPublicBlogUseCase(deps.repository as never).handle({
        idOrSlug: 'khong-co',
      }),
    ).rejects.toThrow();

    expect(deps.repository.incrementViewCount).not.toHaveBeenCalled();
  });

  it('đọc thành công thì tăng lượt xem đúng một lần', async () => {
    const deps = makeDeps();

    await new GetPublicBlogUseCase(deps.repository as never).handle({
      idOrSlug: 'tam-tu',
    });

    expect(deps.repository.incrementViewCount).toHaveBeenCalledTimes(1);
    expect(deps.repository.incrementViewCount).toHaveBeenCalledWith(BlogId);
  });
});
