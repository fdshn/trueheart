import { CreateCategoryUseCase } from './create-category.use-case';

function makeRepository() {
  return {
    findOneBy: jest.fn(async () => null),
    insert: jest.fn(async () => undefined),
    findOneByOrFail: jest.fn(async (criteria) => ({
      globalId: criteria.globalId,
      name: 'Sách',
      slug: 'sach',
      icon: 'book',
      sortOrder: 10,
      isActive: true,
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    })),
  };
}

describe('CreateCategoryUseCase', () => {
  it('tạo slug URL-safe từ name khi admin không truyền slug', async () => {
    const repository = makeRepository();
    const useCase = new CreateCategoryUseCase(repository as never);

    await useCase.handle({
      category: { name: 'Sách Giáo Khoa', icon: 'book', sortOrder: 10 },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sach-giao-khoa', isActive: true }),
    );
  });

  it('không tạo trùng slug kể cả slug viết hoa/thừa khoảng trắng', async () => {
    const repository = makeRepository();
    repository.findOneBy.mockResolvedValue({
      globalId: 'already-exists',
    } as never);
    const useCase = new CreateCategoryUseCase(repository as never);

    await expect(
      useCase.handle({ category: { name: 'Sách', slug: '  SACH  ' } }),
    ).rejects.toThrow();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('chỉ nhận parent còn active', async () => {
    const repository = makeRepository();
    repository.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({
      globalId: 'parent-id',
      isActive: false,
    } as never);
    const useCase = new CreateCategoryUseCase(repository as never);

    await expect(
      useCase.handle({
        category: { name: 'Sách thiếu nhi', parentId: 'parent-id' },
      }),
    ).rejects.toThrow();
  });
});
