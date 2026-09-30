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
      findActiveTree: jest.fn(async () => rows.filter((row) => row.isActive)),
      findAdminTree: jest.fn(async () => rows),
    } as never,
    { hasPermission: jest.fn(async () => true) } as never,
  );
}

const asAdmin = { includeInactive: true, actorUserId: 'admin' };

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

  it('cây có VÒNG vẫn ra được ở đường Admin, kèm cờ orphaned', async () => {
    // Ca nặng nhất của phân hệ: A → B → C rồi đặt `A.parent = C`. Mọi nút đều có
    // cha hợp lệ và `is_active = true`, nên không nút nào là gốc — trước 30/09 cả
    // nhánh biến mất khỏi CẢ hai đường đọc, kể cả Admin, và khi đó không lấy được
    // `categoryId` nào qua API để sửa. Chỉ còn đường SQL tay.
    const result = await makeUseCase([
      node('a', 'c'),
      node('b', 'a'),
      node('c', 'b'),
    ]).handle(asAdmin);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].categoryId).toBe('a');
    expect(result.categories[0].orphaned).toBe(true);
  });

  it('và vòng không làm đệ quy chạy mãi — nó đóng lại đúng một lần', async () => {
    const result = await makeUseCase([
      node('a', 'c'),
      node('b', 'a'),
      node('c', 'b'),
    ]).handle(asAdmin);

    // a → b → c → a, và lượt gặp lại `a` dừng tại đó.
    const b = result.categories[0].children;
    expect(b.map((item) => item.categoryId)).toEqual(['b']);
    expect(b[0].children.map((item) => item.categoryId)).toEqual(['c']);
    const closing = b[0].children[0].children;
    expect(closing.map((item) => item.categoryId)).toEqual(['a']);
    expect(closing[0].children).toEqual([]);
    expect(closing[0].orphaned).toBe(true);
  });

  it('đường công khai KHÔNG trả nhánh có vòng', async () => {
    const result = await makeUseCase([
      node('a', 'c'),
      node('b', 'a'),
      node('c', 'b'),
    ]).handle({});

    expect(result.categories).toEqual([]);
  });

  it('con đang bật dưới cha đã tắt: Admin thấy, và effectivelyActive là false', async () => {
    // Trước 30/09 Admin thấy `isActive: true` cho một danh mục mà người dùng hoàn
    // toàn không thấy, và không có tín hiệu nào về việc đó.
    const rows = [
      { ...node('cha', null), isActive: false },
      node('con', 'cha'),
    ];
    const admin = await makeUseCase(rows).handle(asAdmin);

    const con = admin.categories
      .flatMap((item) => [item, ...item.children])
      .find((item) => item.categoryId === 'con');
    expect(con?.isActive).toBe(true);
    expect(con?.effectivelyActive).toBe(false);
  });

  it('và đường công khai không trả con đó', async () => {
    const rows = [
      { ...node('cha', null), isActive: false },
      node('con', 'cha'),
    ];
    const result = await makeUseCase(rows).handle({});

    expect(result.categories).toEqual([]);
  });
});
