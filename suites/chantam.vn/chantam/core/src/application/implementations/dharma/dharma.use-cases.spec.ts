import {
  DharmaContentNotFoundException,
  DharmaContentNotRecitableException,
  DharmaRecitationAlreadyCompletedException,
  DharmaRecitationNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IDharmaContent,
  IDharmaRecitation,
  IDharmaRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CompleteRecitationUseCase,
  CreateDharmaContentUseCase,
  GetDharmaHubUseCase,
  ListPublicDharmaContentsUseCase,
  StartRecitationUseCase,
  UpdateDharmaContentUseCase,
} from './dharma.use-cases';

const AdminId = 'admin';
const ReciterId = 'reciter';

function content(overrides: Partial<IDharmaContent> = {}): IDharmaContent {
  return {
    globalId: 'content-1',
    contentType: 'SUTRA',
    category: 'kinh-dai-thua',
    title: 'Kinh Địa Tạng',
    slug: 'kinh-dia-tang',
    summary: null,
    bodyText: 'Như thị ngã văn.',
    audioUrl: null,
    coverUrl: null,
    displayOrder: 1,
    isFeatured: false,
    isPublished: true,
    publishedAt: new Date(),
    viewCount: 0,
    createdBy: AdminId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function recitation(
  overrides: Partial<IDharmaRecitation> = {},
): IDharmaRecitation {
  return {
    globalId: 'recitation-1',
    contentId: 'content-1',
    userId: ReciterId,
    startedAt: new Date(),
    completedAt: null,
    durationSeconds: null,
    ...overrides,
  };
}

function makeRepository(): jest.Mocked<IDharmaRepository> {
  return {
    createContent: jest.fn().mockResolvedValue(content()),
    slugTaken: jest.fn().mockResolvedValue(false),
    findContentByGlobalId: jest.fn().mockResolvedValue(content()),
    findPublishedContentByIdOrSlug: jest.fn().mockResolvedValue(content()),
    listPublishedContents: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listContentsForAdmin: jest.fn(),
    updateContent: jest.fn().mockResolvedValue(content()),
    softDeleteContent: jest.fn(),
    incrementViewCount: jest.fn().mockResolvedValue(undefined),
    startRecitation: jest.fn().mockResolvedValue(recitation()),
    findRecitationByGlobalId: jest.fn(),
    completeRecitation: jest.fn(),
    listOwnRecitations: jest.fn(),
    countCompletedRecitations: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<IDharmaRepository>;
}

function makeAdmin(granted: boolean) {
  return {
    hasPermission: jest.fn().mockResolvedValue(granted),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

describe('CreateDharmaContentUseCase', () => {
  it('đòi dharma.manage, không đòi blog.manage', async () => {
    const repository = makeRepository();
    const admin = makeAdmin(true);

    await new CreateDharmaContentUseCase(repository, admin).handle({
      contentType: 'SUTRA',
      title: 'Kinh Địa Tạng',
      bodyText: 'x',
      actorUserId: AdminId,
    });

    expect(admin.hasPermission).toHaveBeenCalledWith(AdminId, 'dharma.manage');
  });

  it('kiểm quyền TRƯỚC khi hỏi slug', async () => {
    const repository = makeRepository();
    await expect(
      new CreateDharmaContentUseCase(repository, makeAdmin(false)).handle({
        contentType: 'MANTRA',
        title: 'x',
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.slugTaken).not.toHaveBeenCalled();
  });

  it('chuẩn hoá danh mục về slug trước khi ghi', async () => {
    const repository = makeRepository();

    await new CreateDharmaContentUseCase(repository, makeAdmin(true)).handle({
      contentType: 'SUTRA',
      title: 'Kinh Địa Tạng',
      category: 'Kinh Đại Thừa',
      bodyText: 'x',
      actorUserId: AdminId,
    });

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'kinh-dai-thua' }),
    );
  });

  it('bản nháp mặc định KHÔNG xuất bản, và lưu được dù rỗng', async () => {
    const repository = makeRepository();

    await new CreateDharmaContentUseCase(repository, makeAdmin(true)).handle({
      contentType: 'SUTRA',
      title: 'Kinh Pháp Hoa',
      actorUserId: AdminId,
    });

    expect(repository.createContent).toHaveBeenCalledWith(
      expect.objectContaining({ isPublished: false, bodyText: '' }),
    );
  });

  it('xuất bản mà rỗng bị từ chối trước khi ghi', async () => {
    const repository = makeRepository();
    await expect(
      new CreateDharmaContentUseCase(repository, makeAdmin(true)).handle({
        contentType: 'SUTRA',
        title: 'Kinh rỗng',
        isPublished: true,
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.createContent).not.toHaveBeenCalled();
  });
});

describe('UpdateDharmaContentUseCase', () => {
  it('bật isPublished mà không gửi bodyText thì soi BẢN ĐÃ LƯU', async () => {
    // Thiếu phép kiểm này thì `CHK_dharma_contents_published_has_body` ném một lỗi ràng
    // buộc thay vì một thông báo đọc được — và nó là lớp cuối, không phải lớp duy nhất.
    const repository = makeRepository();
    repository.findContentByGlobalId.mockResolvedValue(
      content({ bodyText: '   ', isPublished: false, publishedAt: null }),
    );

    await expect(
      new UpdateDharmaContentUseCase(repository, makeAdmin(true)).handle({
        actorUserId: AdminId,
        contentId: 'content-1',
        isPublished: true,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('bật isPublished kèm bodyText thì đi qua', async () => {
    const repository = makeRepository();
    repository.findContentByGlobalId.mockResolvedValue(
      content({ bodyText: '', isPublished: false, publishedAt: null }),
    );

    await new UpdateDharmaContentUseCase(repository, makeAdmin(true)).handle({
      actorUserId: AdminId,
      contentId: 'content-1',
      bodyText: 'Như thị ngã văn.',
      isPublished: true,
    });

    expect(repository.updateContent).toHaveBeenCalled();
  });

  it('bỏ qua chính nó khi hỏi slug trùng', async () => {
    // Thiếu `exceptGlobalId` thì sửa tiêu đề mà giữ slug cũ sẽ tự báo "slug đã có người dùng".
    const repository = makeRepository();

    await new UpdateDharmaContentUseCase(repository, makeAdmin(true)).handle({
      actorUserId: AdminId,
      contentId: 'content-1',
      slug: 'kinh-dia-tang',
    });

    expect(repository.slugTaken).toHaveBeenCalledWith(
      'kinh-dia-tang',
      'content-1',
    );
  });

  it('nội dung không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findContentByGlobalId.mockResolvedValue(null);

    await expect(
      new UpdateDharmaContentUseCase(repository, makeAdmin(true)).handle({
        actorUserId: AdminId,
        contentId: 'khong-co',
        title: 'x',
      }),
    ).rejects.toThrow(DharmaContentNotFoundException);
  });
});

describe('ListPublicDharmaContentsUseCase', () => {
  it('chuẩn hoá danh mục ở LƯỢT LỌC, không chỉ lượt ghi', async () => {
    // Người dùng lọc bằng chuỗi gõ tay, và không chuẩn hoá thì bộ lọc im lặng trả rỗng.
    const repository = makeRepository();

    await new ListPublicDharmaContentsUseCase(repository).handle({
      limit: 20,
      offset: 0,
      category: 'Kinh Đại Thừa',
    });

    expect(repository.listPublishedContents).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'kinh-dai-thua' }),
    );
  });

  it('danh mục rác thành undefined, không thành chuỗi rỗng', async () => {
    const repository = makeRepository();

    await new ListPublicDharmaContentsUseCase(repository).handle({
      limit: 20,
      offset: 0,
      category: '🙏',
    });

    expect(repository.listPublishedContents).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined }),
    );
  });
});

describe('StartRecitationUseCase', () => {
  it('chỉ SUTRA tụng được', async () => {
    const repository = makeRepository();
    repository.findContentByGlobalId.mockResolvedValue(
      content({ contentType: 'INFO' }),
    );

    await expect(
      new StartRecitationUseCase(repository).handle({
        actorUserId: ReciterId,
        contentId: 'content-1',
      }),
    ).rejects.toThrow(DharmaContentNotRecitableException);
    expect(repository.startRecitation).not.toHaveBeenCalled();
  });

  it('bản nháp trả NotFound chứ không NotRecitable', async () => {
    // Chưa công khai thì sự TỒN TẠI của nó cũng chưa công khai — nói "không tụng được" là
    // xác nhận nó có thật.
    const repository = makeRepository();
    repository.findContentByGlobalId.mockResolvedValue(
      content({ isPublished: false, publishedAt: null }),
    );

    await expect(
      new StartRecitationUseCase(repository).handle({
        actorUserId: ReciterId,
        contentId: 'content-1',
      }),
    ).rejects.toThrow(DharmaContentNotFoundException);
  });
});

describe('CompleteRecitationUseCase', () => {
  it('đổi được thì KHÔNG đọc thêm lượt nào', async () => {
    const repository = makeRepository();
    repository.completeRecitation.mockResolvedValue(
      recitation({ completedAt: new Date(), durationSeconds: 120 }),
    );

    const result = await new CompleteRecitationUseCase(repository).handle({
      actorUserId: ReciterId,
      recitationId: 'recitation-1',
    });

    expect(result.recitation.durationSeconds).toBe(120);
    // Phép kiểm chủ sở hữu nằm trong WHERE của câu UPDATE, nên không đọc trước.
    expect(repository.findRecitationByGlobalId).not.toHaveBeenCalled();
  });

  it('lượt tụng của NGƯỜI KHÁC trả NotFound, không trả Forbidden', async () => {
    const repository = makeRepository();
    repository.completeRecitation.mockResolvedValue(null);
    repository.findRecitationByGlobalId.mockResolvedValue(
      recitation({ userId: 'nguoi-khac' }),
    );

    await expect(
      new CompleteRecitationUseCase(repository).handle({
        actorUserId: ReciterId,
        recitationId: 'recitation-1',
      }),
    ).rejects.toThrow(DharmaRecitationNotFoundException);
  });

  it('lượt của mình nhưng đã xong thì AlreadyCompleted', async () => {
    const repository = makeRepository();
    repository.completeRecitation.mockResolvedValue(null);
    repository.findRecitationByGlobalId.mockResolvedValue(
      recitation({ completedAt: new Date(), durationSeconds: 60 }),
    );

    await expect(
      new CompleteRecitationUseCase(repository).handle({
        actorUserId: ReciterId,
        recitationId: 'recitation-1',
      }),
    ).rejects.toThrow(DharmaRecitationAlreadyCompletedException);
  });
});

describe('GetDharmaHubUseCase', () => {
  it('trả bảy entry, và entry Công đức trỏ sang /merit-units', async () => {
    const repository = makeRepository();

    const result = await new GetDharmaHubUseCase(repository).handle({});

    expect(result.entries).toHaveLength(7);
    const merit = result.entries.find((entry) => entry.entry === 'MERIT');
    expect(merit?.path).toBe('/merit-units');
  });

  it('entry không đếm được có itemCount null, KHÔNG phải 0', async () => {
    // `0` đọc ra "không có gì", trong khi sự thật là con số thuộc phân hệ khác hoặc phụ
    // thuộc người đang xem.
    const repository = makeRepository();

    const result = await new GetDharmaHubUseCase(repository).handle({});

    for (const entry of ['MERIT', 'FORUM', 'RECITATION', 'DEDICATION'])
      expect(
        result.entries.find((item) => item.entry === entry)?.itemCount,
      ).toBeNull();
  });

  it('chỉ đếm cho ba entry dựng từ dharma_contents', async () => {
    const repository = makeRepository();

    await new GetDharmaHubUseCase(repository).handle({});

    expect(repository.listPublishedContents).toHaveBeenCalledTimes(3);
  });
});
