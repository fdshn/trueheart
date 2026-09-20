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
});
