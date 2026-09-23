import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { GetCategoryTreeUseCase } from './get-category-tree.use-case';

const AllTypes = [
  PostTypes.OFFER,
  PostTypes.WANTED,
  PostTypes.CHARITY,
  PostTypes.CLASSIFIED,
  PostTypes.MERIT,
];

function node(
  globalId: string,
  parentId: string | null,
  postTypes: PostTypes[] = AllTypes,
) {
  return {
    globalId,
    name: globalId,
    slug: globalId,
    icon: null,
    sortOrder: 1,
    isActive: true,
    parentId,
    postTypes,
  };
}

function makeUseCase(rows: ReturnType<typeof node>[]) {
  return new GetCategoryTreeUseCase(
    {
      findActiveTree: jest.fn(async () => rows),
    } as never,
    { hasPermission: jest.fn(async () => true) } as never,
  );
}

describe('GetCategoryTreeUseCase', () => {
  it('dựng cây từ danh sách phẳng và không trả category inactive', async () => {
    const result = await makeUseCase([
      node('root', null),
      node('child', 'root'),
    ]).handle();

    expect(result.categories).toEqual([
      expect.objectContaining({
        categoryId: 'root',
        children: [expect.objectContaining({ categoryId: 'child' })],
      }),
    ]);
  });

  it('không lọc gì khi không nêu postType', async () => {
    // Client cũ gọi không tham số vẫn phải thấy nguyên cây như trước.
    const result = await makeUseCase([
      node('root', null, [PostTypes.OFFER]),
      node('khac', null, [PostTypes.CLASSIFIED]),
    ]).handle({});

    expect(result.categories).toHaveLength(2);
  });

  it('chỉ trả danh mục dùng được cho loại bài được hỏi', async () => {
    const result = await makeUseCase([
      node('rao-vat', null, [PostTypes.CLASSIFIED]),
      node('tang-cho', null, [PostTypes.OFFER]),
    ]).handle({ postType: PostTypes.CLASSIFIED });

    expect(result.categories.map((item) => item.categoryId)).toEqual([
      'rao-vat',
    ]);
  });

  it('giữ nhánh cha không khớp khi nó có con khớp', async () => {
    // Cắt cha đi thì con mất đường về gốc và biến mất khỏi cây — người dùng
    // không thấy danh mục đáng lẽ chọn được.
    const result = await makeUseCase([
      node('cha', null, [PostTypes.OFFER]),
      node('con', 'cha', [PostTypes.CLASSIFIED]),
    ]).handle({ postType: PostTypes.CLASSIFIED });

    expect(result.categories).toEqual([
      expect.objectContaining({
        categoryId: 'cha',
        children: [expect.objectContaining({ categoryId: 'con' })],
      }),
    ]);
  });

  it('nhánh cha giữ lại vẫn mang postTypes thật của nó', async () => {
    // Client đọc trường này để biết node nào chọn được, node nào chỉ là nhánh
    // điều hướng. Sửa nó thành khớp là nói dối.
    const result = await makeUseCase([
      node('cha', null, [PostTypes.OFFER]),
      node('con', 'cha', [PostTypes.CLASSIFIED]),
    ]).handle({ postType: PostTypes.CLASSIFIED });

    expect(result.categories[0].postTypes).toEqual([PostTypes.OFFER]);
  });

  it('bỏ nhánh cha không khớp mà cũng không có con nào khớp', async () => {
    const result = await makeUseCase([
      node('cha', null, [PostTypes.OFFER]),
      node('con', 'cha', [PostTypes.OFFER]),
    ]).handle({ postType: PostTypes.CLASSIFIED });

    expect(result.categories).toEqual([]);
  });
});
