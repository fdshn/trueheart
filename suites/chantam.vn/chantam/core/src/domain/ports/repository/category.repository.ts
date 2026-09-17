import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';
export interface ICategoryRepository extends Repository<ICategoryEntity> {
  findActiveTree(): Promise<ICategoryEntity[]>;
}
export const ICategoryRepository = Symbol('ICategoryRepository');
