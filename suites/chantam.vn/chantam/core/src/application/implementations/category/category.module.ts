import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
} from '@/application/contracts/category';
import { Global, Module } from '@nestjs/common';
import { CreateCategoryUseCase } from './create-category.use-case';
import { GetCategoryTreeUseCase } from './get-category-tree.use-case';

@Global()
@Module({
  providers: [
    { provide: ICreateCategoryUseCase, useClass: CreateCategoryUseCase },
    { provide: IGetCategoryTreeUseCase, useClass: GetCategoryTreeUseCase },
  ],
  exports: [ICreateCategoryUseCase, IGetCategoryTreeUseCase],
})
export class CategoryModule {}
