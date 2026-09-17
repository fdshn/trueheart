import { GetCategoryTreeUseCase } from './get-category-tree.use-case';

describe('GetCategoryTreeUseCase', () => {
  it('dựng cây từ danh sách phẳng và không trả category inactive', async () => {
    const categories = {
      findActiveTree: jest.fn(async () => [
        {
          globalId: 'root',
          name: 'Sách',
          slug: 'sach',
          icon: null,
          sortOrder: 1,
          parentId: null,
        },
        {
          globalId: 'child',
          name: 'Sách giáo khoa',
          slug: 'sach-giao-khoa',
          icon: null,
          sortOrder: 1,
          parentId: 'root',
        },
      ]),
    };
    const result = await new GetCategoryTreeUseCase(
      categories as never,
    ).handle();
    expect(result.categories).toEqual([
      expect.objectContaining({
        categoryId: 'root',
        children: [expect.objectContaining({ categoryId: 'child' })],
      }),
    ]);
  });
});
