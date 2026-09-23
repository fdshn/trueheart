import {
  ICreateCategoryCommand,
  ICreateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { GenericMvpPostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { makeGlobalId, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

@Injectable()
export class CreateCategoryUseCase implements ICreateCategoryUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: ICreateCategoryCommand) {
    if (!(await this.admin.hasPermission(command.userId, 'category.manage')))
      throw new ForbiddenException();

    const input = command.category;
    const slug = slugify((input.slug ?? input.name).trim());
    if (await this.categories.findOneBy({ slug }))
      throw new CategorySlugTakenException(slug);
    if (input.parentId) {
      const parent = await this.categories.findOneBy({
        globalId: input.parentId,
      });
      if (!parent || !parent.isActive) throw new CategoryNotFoundException();
    }
    const globalId = makeGlobalId(`/categories/${slug}`);
    await this.categories.insert({
      globalId,
      name: input.name.trim(),
      slug,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      // Bỏ trống là dùng được cho mọi loại bài: giữ nguyên hành vi trước khi
      // có cột này, để API cũ không đột nhiên tạo ra danh mục không chọn được.
      postTypes: input.postTypes ?? [...GenericMvpPostTypes],
      isActive: true,
      parentId: input.parentId ?? null,
      deletedAt: null,
    });
    const category = toCategoryDto(
      await this.categories.findOneByOrFail({ globalId }),
    );
    await this.admin.appendAudit({
      actorUserId: command.userId,
      action: 'CREATE_CATEGORY',
      resourceType: 'CATEGORY',
      resourceId: globalId,
      before: null,
      after: category,
    });
    return { category };
  }
}
