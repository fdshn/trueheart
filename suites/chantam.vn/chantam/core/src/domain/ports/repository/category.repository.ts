import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';
export interface ICategoryRepository extends Repository<ICategoryEntity> {
  findActiveTree(): Promise<ICategoryEntity[]>;
  findAdminTree(): Promise<ICategoryEntity[]>;
  isSlugTaken(slug: string, exceptCategoryId: string): Promise<boolean>;
}
export const ICategoryRepository = Symbol('ICategoryRepository');
