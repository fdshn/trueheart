import {
  IUpdateCategoryCommand,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { definedProps, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

@Injectable()
export class UpdateCategoryUseCase implements IUpdateCategoryUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IUpdateCategoryCommand) {
    if (!(await this.admin.hasPermission(command.userId, 'category.manage')))
      throw new ForbiddenException();

    const existing = await this.categories.findOneBy({
      globalId: command.categoryId,
    });
    if (!existing || existing.deletedAt) throw new CategoryNotFoundException();

    const input = command.category;
    const update: Record<string, unknown> = definedProps(input);
    if (input.slug !== undefined || input.name !== undefined) {
      const slug = slugify((input.slug ?? input.name ?? existing.name).trim());
      if (await this.categories.isSlugTaken(slug, existing.globalId))
        throw new CategorySlugTakenException(slug);
      update.slug = slug;
    }
    if (input.parentId) {
      const parent = await this.categories.findOneBy({
        globalId: input.parentId,
      });
      if (!parent || !parent.isActive) throw new CategoryNotFoundException();
    }
    await this.categories.update({ globalId: existing.globalId }, update);
    const category = toCategoryDto(
      await this.categories.findOneByOrFail({ globalId: existing.globalId }),
    );
    await this.admin.appendAudit({
      actorUserId: command.userId,
      action: 'UPDATE_CATEGORY',
      resourceType: 'CATEGORY',
      resourceId: existing.globalId,
      before: toCategoryDto(existing),
      after: category,
    });
    return { category };
  }
}
