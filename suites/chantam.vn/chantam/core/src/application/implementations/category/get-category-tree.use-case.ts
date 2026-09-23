import {
  IGetCategoryTreeCommand,
  IGetCategoryTreeUseCase,
} from '@/application/contracts/category';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

/**
 * Tỉa cây theo loại bài, GIỮ LẠI nhánh cha không khớp nhưng có con khớp.
 *
 * Lọc phẳng ở SQL thì danh mục con khớp mà cha không khớp sẽ mất cha, và vì
 * cây dựng từ gốc `null` nên nó biến mất luôn khỏi kết quả — người dùng không
 * thấy danh mục đáng lẽ chọn được. Node cha giữ lại vẫn mang `postTypes` thật
 * của nó, client đọc đó để biết node nào chọn được.
 */
function pruneByPostType(
  categories: ICategoryDto[],
  postType: PostTypes,
): ICategoryDto[] {
  const kept: ICategoryDto[] = [];

  for (const category of categories) {
    const children = pruneByPostType(category.children, postType);

    if (!category.postTypes.includes(postType) && children.length === 0)
      continue;

    kept.push({ ...category, children });
  }

  return kept;
}

@Injectable()
export class GetCategoryTreeUseCase implements IGetCategoryTreeUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetCategoryTreeCommand = {},
  ): Promise<{ categories: ICategoryDto[] }> {
    if (
      command.includeInactive &&
      (!command.actorUserId ||
        !(await this.admin.hasPermission(command.actorUserId, 'category.read')))
    )
      throw new ForbiddenException();
    const rows = command.includeInactive
      ? await this.categories.findAdminTree()
      : await this.categories.findActiveTree();
    const byParent = new Map<string | null, ICategoryDto[]>();

    for (const row of rows) {
      const bucket = byParent.get(row.parentId) ?? [];
      bucket.push(toCategoryDto(row));
      byParent.set(row.parentId, bucket);
    }

    const attachChildren = (category: ICategoryDto): ICategoryDto => ({
      ...category,
      children: (byParent.get(category.categoryId) ?? []).map(attachChildren),
    });

    const tree = (byParent.get(null) ?? []).map(attachChildren);

    return {
      categories: command.postType
        ? pruneByPostType(tree, command.postType)
        : tree,
    };
  }
}
