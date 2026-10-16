import { CategoryPostTypeInUseException } from '@/domain/exceptions';
import { UpdateCategoryUseCase } from './update-category.use-case';

const CategoryId = '30000000-0000-4000-8000-000000000003';
const AdminConfig = {
  hasPermission: jest.fn(async () => true),
  appendAudit: jest.fn(async () => undefined),
};

describe('UpdateCategoryUseCase', () => {
  it('deactivate category thay vì xoá cứng', async () => {
    const categories = {
      findOneBy: jest.fn(async () => ({
        globalId: CategoryId,
        isActive: true,
      })),
      update: jest.fn(async () => undefined),
      findOneByOrFail: jest.fn(async () => ({
        globalId: CategoryId,
        name: 'Sách',
        slug: 'sach',
        icon: 'book',
        sortOrder: 30,
        isActive: false,
        postTypes: [],
        parentId: null,
      })),
      isSlugTaken: jest.fn(async () => false),
      // Khong con bai nao dung -> tat duoc. Ca con bai thu rieng ben duoi.
      countPostsInSubtree: jest.fn(async () => 0),
      findAncestorChain: jest.fn(async () => []),
      measureDepthAfterMove: jest.fn(async () => 1),
    };
    const useCase = new UpdateCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await useCase.handle({
      categoryId: CategoryId,
      userId: 'u',
      username: 'demo-admin',
      category: { isActive: false },
    });
    expect(categories.update).toHaveBeenCalledWith(
      { globalId: CategoryId },
      { isActive: false },
    );
  });

  it('không nhận parent inactive', async () => {
    const categories = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ globalId: CategoryId, isActive: true })
        .mockResolvedValueOnce({ globalId: 'parent', isActive: false }),
      update: jest.fn(),
      isSlugTaken: jest.fn(async () => false),
      findAncestorChain: jest.fn(async () => []),
      measureDepthAfterMove: jest.fn(async () => 2),
      countPostsInSubtree: jest.fn(async () => 0),
    };
    const useCase = new UpdateCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(
      useCase.handle({
        categoryId: CategoryId,
        userId: 'u',
        username: 'demo-admin',
        category: { parentId: 'parent' },
      }),
    ).rejects.toThrow();
    expect(categories.update).not.toHaveBeenCalled();
  });

  it('từ chối user thiếu quyền category.manage', async () => {
    const categories = {
      findOneBy: jest.fn(),
      update: jest.fn(),
      isSlugTaken: jest.fn(),
    };
    const denied = { hasPermission: jest.fn(async () => false) };
    const useCase = new UpdateCategoryUseCase(
      categories as never,
      denied as never,
    );
    await expect(
      useCase.handle({
        categoryId: CategoryId,
        userId: 'u',
        username: 'member',
        category: { isActive: false },
      }),
    ).rejects.toThrow();
    expect(categories.findOneBy).not.toHaveBeenCalled();
  });

  it('không bật lại được danh mục đã GỘP, và nói rõ nó đã đi đâu', async () => {
    // Ràng buộc `CHK_categories_merged_is_inactive` chặn việc này ở tầng database,
    // nhưng một ràng buộc nổ ra thành 500 thì Admin đọc được "Đã xảy ra lỗi không
    // xác định" — đo được trong lượt thăm dò 30/09. Chặn ở đây để họ biết VÌ SAO.
    const categories = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({
          globalId: CategoryId,
          name: 'Đồ gia dụng',
          isActive: false,
          mergedIntoId: 'target-id',
        })
        .mockResolvedValueOnce({ globalId: 'target-id', name: 'Gia dụng' }),
      update: jest.fn(),
      isSlugTaken: jest.fn(async () => false),
    };
    const useCase = new UpdateCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await expect(
      useCase.handle({
        categoryId: CategoryId,
        userId: 'u',
        username: 'demo-admin',
        category: { isActive: true },
      }),
    ).rejects.toThrow(/Gia dụng/);
    expect(categories.update).not.toHaveBeenCalled();
  });

  it('vẫn bật lại được danh mục Admin tắt TAY', async () => {
    const categories = {
      findOneBy: jest.fn(async () => ({
        globalId: CategoryId,
        name: 'Sách',
        isActive: false,
        mergedIntoId: null,
      })),
      update: jest.fn(async () => undefined),
      findOneByOrFail: jest.fn(async () => ({
        globalId: CategoryId,
        name: 'Sách',
        slug: 'sach',
        icon: null,
        sortOrder: 0,
        isActive: true,
        postTypes: [],
        parentId: null,
        mergedIntoId: null,
        mergeReason: null,
      })),
      isSlugTaken: jest.fn(async () => false),
    };
    const useCase = new UpdateCategoryUseCase(
      categories as never,
      AdminConfig as never,
    );
    await useCase.handle({
      categoryId: CategoryId,
      userId: 'u',
      username: 'demo-admin',
      category: { isActive: true },
    });
    expect(categories.update).toHaveBeenCalledWith(
      { globalId: CategoryId },
      { isActive: true },
    );
  });

  describe('postTypes (CMS backlog A12)', () => {
    function makeCategories(postsOfRemovedTypes: number) {
      return {
        findOneBy: jest.fn(async () => ({
          globalId: CategoryId,
          name: 'Sách',
          isActive: true,
          postTypes: ['OFFER', 'WANTED'],
        })),
        update: jest.fn(async () => undefined),
        findOneByOrFail: jest.fn(async () => ({
          globalId: CategoryId,
          name: 'Sách',
          slug: 'sach',
          icon: null,
          sortOrder: 0,
          isActive: true,
          postTypes: ['OFFER'],
          parentId: null,
        })),
        isSlugTaken: jest.fn(async () => false),
        countPostsInSubtree: jest.fn(async () => 0),
        countPostsOfTypes: jest.fn(
          async (_id: string, _types: string[]) => postsOfRemovedTypes,
        ),
        findAncestorChain: jest.fn(async () => []),
        measureDepthAfterMove: jest.fn(async () => 1),
      };
    }

    const run = (
      categories: ReturnType<typeof makeCategories>,
      postTypes: string[],
    ) =>
      new UpdateCategoryUseCase(
        categories as never,
        AdminConfig as never,
      ).handle({
        categoryId: CategoryId,
        userId: 'u',
        username: 'demo-admin',
        category: { postTypes: postTypes as never },
      });

    it('bỏ một loại còn bài dùng thì 409 và không ghi gì', async () => {
      const categories = makeCategories(3);

      await expect(run(categories, ['OFFER'])).rejects.toThrow(
        CategoryPostTypeInUseException,
      );
      expect(categories.countPostsOfTypes).toHaveBeenCalledWith(CategoryId, [
        'WANTED',
      ]);
      expect(categories.update).not.toHaveBeenCalled();
    });

    it('bỏ một loại không còn bài nào thì ghi được', async () => {
      const categories = makeCategories(0);

      await run(categories, ['OFFER']);

      expect(categories.update).toHaveBeenCalledWith(
        { globalId: CategoryId },
        { postTypes: ['OFFER'] },
      );
    });

    it('chỉ THÊM loại thì không cần đếm bài', async () => {
      const categories = makeCategories(99);

      await run(categories, ['OFFER', 'WANTED', 'CHARITY']);

      expect(categories.countPostsOfTypes).not.toHaveBeenCalled();
      expect(categories.update).toHaveBeenCalledWith(
        { globalId: CategoryId },
        { postTypes: ['OFFER', 'WANTED', 'CHARITY'] },
      );
    });
  });
});
