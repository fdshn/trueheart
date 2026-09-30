import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';

export function toCategoryDto(
  category: ICategoryEntity,
  children: ICategoryDto[] = [],
  flags: { detached?: boolean } = {},
): ICategoryDto {
  return {
    categoryId: category.globalId,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    postTypes: category.postTypes,
    children,
    // `detached` = cha không có trong tập dòng đọc được. Ở đường Admin điều đó
    // nghĩa là nhánh có vòng; ở đường công khai nghĩa là tổ tiên đã tắt. Cả hai
    // đều làm nút vô hình trên cây, nên nó KHÔNG "đang hoạt động" theo nghĩa người
    // dùng thấy — dù cột `is_active` của chính nó là true.
    effectivelyActive: category.isActive && !flags.detached,
    orphaned: flags.detached === true,
    mergedInto: category.mergedIntoId
      ? { categoryId: category.mergedIntoId, reason: category.mergeReason }
      : null,
  };
}
