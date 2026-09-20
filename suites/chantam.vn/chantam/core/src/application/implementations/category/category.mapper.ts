import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
export function toCategoryDto(
  category: ICategoryEntity,
  children: ICategoryDto[] = [],
): ICategoryDto {
  return {
    categoryId: category.globalId,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    sortOrder: category.sortOrder,
    postTypes: category.postTypes,
    children,
  };
}
