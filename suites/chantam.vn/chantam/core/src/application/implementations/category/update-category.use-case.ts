import {
  IUpdateCategoryCommand,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { ICategoryRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { definedProps, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

@Injectable()
export class UpdateCategoryUseCase implements IUpdateCategoryUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(command: IUpdateCategoryCommand) {
    if (
      !this.config.categoryAdmin.usernames.includes(
        command.username.toLowerCase(),
      )
    )
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
    return {
      category: toCategoryDto(
        await this.categories.findOneByOrFail({ globalId: existing.globalId }),
      ),
    };
  }
}
