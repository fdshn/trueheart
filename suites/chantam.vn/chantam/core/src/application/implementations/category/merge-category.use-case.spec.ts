import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { MergeCategoryUseCase } from './merge-category.use-case';

const SourceId = '30000000-0000-4000-8000-00000000000a';
const TargetId = '30000000-0000-4000-8000-00000000000b';

const AdminConfig = {
  hasPermission: jest.fn(async () => true),
  appendAudit: jest.fn(async () => undefined),
};

function makeCategory(overrides: Record<string, unknown> = {}) {
  return {
    globalId: SourceId,
    name: 'Đồ gia dụng',
    slug: 'do-gia-dung',
    icon: null,
    sortOrder: 0,
    isActive: true,
    postTypes: [],
    parentId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepository(overrides: Record<string, unknown> = {}) {
  return {
    findOneBy: jest.fn(async (criteria: { globalId: string }) =>
      criteria.globalId === SourceId
        ? makeCategory()
        : makeCategory({ globalId: TargetId, name: 'Gia dụng' }),
    ),
    findOneByOrFail: jest.fn(async () =>
      makeCategory({ globalId: TargetId, name: 'Gia dụng' }),
    ),
    findSubtreeIds: jest.fn(async () => [SourceId]),
    measureDepthAfterMove: jest.fn(async () => 2),
    mergeInto: jest.fn(async () => ({ movedPosts: 12, movedChildren: 2 })),
    ...overrides,
  };
}

const command = {
  categoryId: SourceId,
  userId: 'u',
  username: 'demo-admin',
  merge: { targetCategoryId: TargetId, reason: '  Trùng nghĩa  ' },
};

describe('MergeCategoryUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chuyển bài và con, rồi báo lại số đã chuyển', async () => {
    const categories = makeRepository();
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    const result = await useCase.handle(command as never);

    expect(categories.mergeInto).toHaveBeenCalledWith({
      sourceId: SourceId,
      targetId: TargetId,
      // Lý do được cắt khoảng trắng: nó đi vào audit log và vào cột
      // `merge_reason`, nơi một chuỗi thừa khoảng trắng đọc lên trông như lỗi.
      reason: 'Trùng nghĩa',
    });
    expect(result.movedPosts).toBe(12);
    expect(result.movedChildren).toBe(2);
    expect(result.category.categoryId).toBe(TargetId);
  });

  it('ghi audit MERGE_CATEGORY kèm đích và số đã chuyển', async () => {
    const categories = makeRepository();
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await useCase.handle(command as never);

    expect(AdminConfig.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MERGE_CATEGORY',
        resourceId: SourceId,
        after: expect.objectContaining({
          mergedInto: TargetId,
          movedPosts: 12,
        }),
      }),
    );
  });

  it('không gộp vào chính nó', async () => {
    const categories = makeRepository();
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(
      useCase.handle({
        ...command,
        merge: { ...command.merge, targetCategoryId: SourceId },
      } as never),
    ).rejects.toThrow();
    expect(categories.mergeInto).not.toHaveBeenCalled();
  });

  it('không gộp CHA vào CON của nó — đó là vòng tới bằng cửa khác', async () => {
    const categories = makeRepository({
      findSubtreeIds: jest.fn(async () => [SourceId, TargetId]),
    });
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(useCase.handle(command as never)).rejects.toThrow();
    expect(categories.mergeInto).not.toHaveBeenCalled();
  });

  it('đích phải nhận được mọi loại bài mà nguồn đang nhận', async () => {
    // Nguồn nhận WANTED, đích chỉ khai OFFER: gộp sang là đẩy những bài WANTED vào
    // một danh mục không khai loại của chúng, và từ đó `update-post` không sửa được.
    const categories = makeRepository({
      findOneBy: jest.fn(async (criteria: { globalId: string }) =>
        criteria.globalId === SourceId
          ? makeCategory({ postTypes: [PostTypes.WANTED] })
          : makeCategory({
              globalId: TargetId,
              postTypes: [PostTypes.OFFER],
            }),
      ),
    });
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(useCase.handle(command as never)).rejects.toThrow();
    expect(categories.mergeInto).not.toHaveBeenCalled();
  });

  it('không gộp vào một đích đã tắt', async () => {
    const categories = makeRepository({
      findOneBy: jest.fn(async (criteria: { globalId: string }) =>
        criteria.globalId === SourceId
          ? makeCategory()
          : makeCategory({ globalId: TargetId, isActive: false }),
      ),
    });
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(useCase.handle(command as never)).rejects.toThrow();
    expect(categories.mergeInto).not.toHaveBeenCalled();
  });

  it('chặn khi gộp xong cây vượt trần độ sâu', async () => {
    const categories = makeRepository({
      measureDepthAfterMove: jest.fn(async () => 5),
    });
    const useCase = new MergeCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(useCase.handle(command as never)).rejects.toThrow();
    expect(categories.mergeInto).not.toHaveBeenCalled();
  });

  it('từ chối user thiếu quyền category.manage', async () => {
    const categories = makeRepository();
    const denied = { hasPermission: jest.fn(async () => false) };
    const useCase = new MergeCategoryUseCase(
      categories as never,
      denied as never,
    );
    await expect(useCase.handle(command as never)).rejects.toThrow();
    expect(categories.findOneBy).not.toHaveBeenCalled();
  });
});
