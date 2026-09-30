import {
  CategoryDepthExceededException,
  CategoryInUseException,
  CategoryNotFoundException,
  CategoryParentCycleException,
  CategoryPostTypeNotAllowedException,
} from '@/domain/exceptions';
import { ICategoryRepository } from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';

/**
 * Độ sâu tối đa của cây danh mục, tính từ gốc (gốc là tầng 1).
 *
 * Bốn tầng là giới hạn của màn hình chọn danh mục trên điện thoại, không phải giới
 * hạn kỹ thuật. Đặt hằng chứ không cấu hình động: nới nó ra là đổi thiết kế giao
 * diện, không phải đổi một con số vận hành — và một khoá cấu hình không ai đọc thì
 * tệ hơn một hằng có tên (xem `test:config-inventory`).
 */
export const MaxCategoryDepth = 4;

/**
 * Cha mới KHÔNG được nằm trong nhánh con của danh mục đang sửa.
 *
 * ## Vì sao đây là lỗ nặng nhất của phân hệ, không phải chuyện thẩm mỹ
 *
 * Cây dựng bằng cách đi từ gốc `parent_id IS NULL` xuống. Một nhánh có vòng thì
 * không nút nào của nó còn là gốc, nên **cả nhánh biến mất khỏi CẢ hai đường đọc,
 * kể cả đường của Admin**. Đo được: dựng A → B → C rồi đặt `A.parent = C`, sau đó
 * `GET /categories` và `GET /admin/categories` đều không còn Probe nào, trong khi ba
 * dòng vẫn `is_active = true` trong database.
 *
 * Hệ quả: không lấy lại được `categoryId` qua API để `PATCH` về, nên chỉ còn đường
 * SQL tay. Một lượt bấm sai của Admin tạo ra trạng thái mà chính Admin không gỡ được.
 *
 * ## Kiểm bằng cách đi LÊN từ cha mới
 *
 * Đi lên rẻ hơn đi xuống: chuỗi tổ tiên dài tối đa `MaxCategoryDepth`, còn nhánh con
 * có thể rộng bao nhiêu cũng được. Nếu trên đường đi lên gặp chính danh mục đang
 * sửa thì cha mới là con cháu của nó.
 *
 * Tự làm cha của chính mình cũng bị chặn ở đây: `findAncestorChain` trả về chính nó
 * ở phần tử đầu.
 */
export async function assertNoParentCycle(
  categories: ICategoryRepository,
  params: { categoryId: string; parentId: string; parentName: string },
): Promise<void> {
  const chain = await categories.findAncestorChain(params.parentId);
  if (chain.some((link) => link.categoryId === params.categoryId))
    throw new CategoryParentCycleException(params.parentName);
}

/** Cây không được sâu quá `MaxCategoryDepth` tầng sau khi chuyển. */
export async function assertDepthWithinLimit(
  categories: ICategoryRepository,
  params: { categoryId: string | null; parentId: string | null },
): Promise<void> {
  const depth = await categories.measureDepthAfterMove(
    params.categoryId,
    params.parentId,
  );
  if (depth > MaxCategoryDepth)
    throw new CategoryDepthExceededException(MaxCategoryDepth);
}

/**
 * Không tắt danh mục còn bài dùng — kể cả bài nằm ở nhánh con.
 *
 * [22 §22.2](../../../../../../docs/diagram/22-category.md) vẽ nhánh 409 này từ đầu
 * kèm lý do: *"Tắt một danh mục đang có 3.000 bài là làm 3.000 bài biến mất khỏi bộ
 * lọc mà không ai báo trước."* Nhưng code chưa từng có phép kiểm nào —
 * `definedProps(input)` đẩy thẳng `isActive` vào `UPDATE`. Đo được: tắt danh mục
 * "Sách" đang có 34 bài thành công, không 409.
 *
 * Đếm cả nhánh con vì tắt cha làm cả nhánh mất chỗ hiện, dù `category_id` của bài ở
 * lá không trỏ vào cha.
 */
export async function assertNotInUseBeforeDeactivating(
  categories: ICategoryRepository,
  categoryId: string,
): Promise<void> {
  const postCount = await categories.countPostsInSubtree(categoryId);
  if (postCount > 0) throw new CategoryInUseException(postCount);
}

/**
 * Danh mục gán được cho bài: tồn tại, đang bật, VÀ không có tổ tiên nào đã tắt.
 *
 * Vế tổ tiên là chỗ `create-post` thiếu: nó chỉ kiểm `category.isActive` của chính
 * danh mục. Nên một danh mục active dưới một cha đã tắt thì vô hình trên cây —
 * người dùng không chọn được — mà vẫn gán được qua một lượt gọi API trực tiếp.
 */
export async function assertCategoryAssignable(
  categories: ICategoryRepository,
  categoryId: string,
): Promise<void> {
  const chain = await categories.findAncestorChain(categoryId);
  if (chain.length === 0) throw new CategoryNotFoundException();
  if (chain.some((link) => !link.isActive))
    throw new CategoryNotFoundException();
}

/**
 * Bài phải thuộc loại mà danh mục khai nhận.
 *
 * Trước 30/09 `postTypes` xuất hiện đúng hai chỗ — mapper trả ra và
 * `pruneByPostType` tỉa cây hiển thị — nên nó là **ràng buộc tư vấn**: server nói
 * với client "danh mục này chỉ nhận OFFER", client tuân, còn một lượt gọi API trực
 * tiếp thì đặt WANTED vào đó được. Đo được: bài WANTED vào danh mục khai `{OFFER}`
 * tạo thành công và nằm trong database.
 *
 * Danh mục khai danh sách RỖNG thì nhận mọi loại: đó là hành vi trước khi cột này
 * tồn tại, và siết nó ở đây sẽ làm mọi danh mục cũ đột nhiên không đăng được bài nào.
 */
export function assertPostTypeAllowed(
  category: Pick<ICategoryEntity, 'postTypes'>,
  postType: PostTypes,
): void {
  const allowed = category.postTypes ?? [];
  if (allowed.length === 0) return;
  if (allowed.includes(postType)) return;

  throw new CategoryPostTypeNotAllowedException(postType, allowed.join(', '));
}
