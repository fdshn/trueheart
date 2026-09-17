import { IGetCategoryTreeUseCase } from '@/application/contracts/category';
import { ICategoryRepository } from '@/domain/ports/repository';
import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

@Injectable()
export class GetCategoryTreeUseCase implements IGetCategoryTreeUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
  ) {}

  public async handle(): Promise<{ categories: ICategoryDto[] }> {
    const rows = await this.categories.findActiveTree();
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

    return { categories: (byParent.get(null) ?? []).map(attachChildren) };
  }
}
