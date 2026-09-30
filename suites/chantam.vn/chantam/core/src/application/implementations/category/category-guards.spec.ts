import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  assertCategoryAssignable,
  assertDepthWithinLimit,
  assertNoParentCycle,
  assertNotInUseBeforeDeactivating,
  assertPostTypeAllowed,
  MaxCategoryDepth,
} from './category-guards';

const CategoryId = '30000000-0000-4000-8000-000000000001';
const ParentId = '30000000-0000-4000-8000-000000000002';

describe('assertNoParentCycle', () => {
  it('chặn khi cha mới là CON CHÁU của danh mục đang sửa', async () => {
    // Chuỗi tổ tiên của cha mới đi qua chính danh mục đang sửa → đặt nó làm cha là
    // tạo vòng, và một nhánh có vòng biến mất khỏi CẢ hai đường đọc.
    const categories = {
      findAncestorChain: jest.fn(async () => [
        { categoryId: ParentId, isActive: true },
        { categoryId: CategoryId, isActive: true },
      ]),
    };
    await expect(
      assertNoParentCycle(categories as never, {
        categoryId: CategoryId,
        parentId: ParentId,
        parentName: 'Điện thoại',
      }),
    ).rejects.toThrow();
  });

  it('chặn tự làm cha của chính mình', async () => {
    // `findAncestorChain` trả chính nó ở phần tử đầu, nên ca này đi cùng đường trên
    // chứ không cần phép kiểm riêng trong code.
    const categories = {
      findAncestorChain: jest.fn(async () => [
        { categoryId: CategoryId, isActive: true },
      ]),
    };
    await expect(
      assertNoParentCycle(categories as never, {
        categoryId: CategoryId,
        parentId: CategoryId,
        parentName: 'Chính nó',
      }),
    ).rejects.toThrow();
  });

  it('cho qua khi cha mới nằm ở nhánh khác', async () => {
    const categories = {
      findAncestorChain: jest.fn(async () => [
        { categoryId: ParentId, isActive: true },
        { categoryId: 'goc-khac', isActive: true },
      ]),
    };
    await expect(
      assertNoParentCycle(categories as never, {
        categoryId: CategoryId,
        parentId: ParentId,
        parentName: 'Nhánh khác',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('assertDepthWithinLimit', () => {
  it('cho qua khi đúng bằng trần', async () => {
    const categories = {
      measureDepthAfterMove: jest.fn(async () => MaxCategoryDepth),
    };
    await expect(
      assertDepthWithinLimit(categories as never, {
        categoryId: CategoryId,
        parentId: ParentId,
      }),
    ).resolves.toBeUndefined();
  });

  it('chặn khi vượt trần một tầng', async () => {
    const categories = {
      measureDepthAfterMove: jest.fn(async () => MaxCategoryDepth + 1),
    };
    await expect(
      assertDepthWithinLimit(categories as never, {
        categoryId: CategoryId,
        parentId: ParentId,
      }),
    ).rejects.toThrow();
  });
});

describe('assertNotInUseBeforeDeactivating', () => {
  it('chặn khi còn bài dùng, và số bài đi vào thông điệp', async () => {
    const categories = { countPostsInSubtree: jest.fn(async () => 34) };
    await expect(
      assertNotInUseBeforeDeactivating(categories as never, CategoryId),
    ).rejects.toThrow(/34/);
  });

  it('cho tắt khi không còn bài nào', async () => {
    const categories = { countPostsInSubtree: jest.fn(async () => 0) };
    await expect(
      assertNotInUseBeforeDeactivating(categories as never, CategoryId),
    ).resolves.toBeUndefined();
  });
});

describe('assertCategoryAssignable', () => {
  it('chặn khi TỔ TIÊN đã tắt dù chính nó đang bật', async () => {
    // Đây là ca mà `create-post` bỏ sót trước 30/09: nó chỉ xem `category.isActive`.
    const categories = {
      findAncestorChain: jest.fn(async () => [
        { categoryId: CategoryId, isActive: true },
        { categoryId: ParentId, isActive: false },
      ]),
    };
    await expect(
      assertCategoryAssignable(categories as never, CategoryId),
    ).rejects.toThrow();
  });

  it('chặn khi chuỗi rỗng — danh mục không tồn tại', async () => {
    const categories = { findAncestorChain: jest.fn(async () => []) };
    await expect(
      assertCategoryAssignable(categories as never, CategoryId),
    ).rejects.toThrow();
  });

  it('cho qua khi cả chuỗi đang bật', async () => {
    const categories = {
      findAncestorChain: jest.fn(async () => [
        { categoryId: CategoryId, isActive: true },
        { categoryId: ParentId, isActive: true },
      ]),
    };
    await expect(
      assertCategoryAssignable(categories as never, CategoryId),
    ).resolves.toBeUndefined();
  });
});

describe('assertPostTypeAllowed', () => {
  it('danh sách RỖNG nhận mọi loại — hành vi trước khi cột này tồn tại', () => {
    expect(() =>
      assertPostTypeAllowed({ postTypes: [] }, PostTypes.WANTED),
    ).not.toThrow();
  });

  it('chặn loại không khai, và nêu loại nào được nhận', () => {
    expect(() =>
      assertPostTypeAllowed({ postTypes: [PostTypes.OFFER] }, PostTypes.WANTED),
    ).toThrow(/OFFER/);
  });

  it('cho qua loại có trong danh sách', () => {
    expect(() =>
      assertPostTypeAllowed(
        { postTypes: [PostTypes.OFFER, PostTypes.WANTED] },
        PostTypes.WANTED,
      ),
    ).not.toThrow();
  });
});
