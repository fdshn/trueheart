import { ICategoryRepository } from '@/domain/ports/repository';
import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';
@Injectable()
export class CategoryRepository
  extends Repository<ICategoryEntity>
  implements ICategoryRepository
{
  constructor(
    @Inject(ICategoryEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
  ) {
    super(target, manager);
  }
  async isSlugTaken(slug: string, exceptCategoryId: string): Promise<boolean> {
    return (
      (await this.createQueryBuilder('category')
        .where('category.slug = :slug', { slug })
        .andWhere('category.globalId != :exceptCategoryId', {
          exceptCategoryId,
        })
        .getCount()) > 0
    );
  }

  async findActiveTree() {
    return this.createQueryBuilder('category')
      .where('category.isActive = true')
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();
  }
}
