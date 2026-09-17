import {
  ICreateCategoryCommand,
  ICreateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import { ICategoryRepository } from '@/domain/ports/repository';
import { makeGlobalId, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';
@Injectable()
export class CreateCategoryUseCase implements ICreateCategoryUseCase {
  constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
  ) {}
  async handle(command: ICreateCategoryCommand) {
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
      isActive: true,
      parentId: input.parentId ?? null,
      deletedAt: null,
    });
    return {
      category: toCategoryDto(
        await this.categories.findOneByOrFail({ globalId }),
      ),
    };
  }
}
