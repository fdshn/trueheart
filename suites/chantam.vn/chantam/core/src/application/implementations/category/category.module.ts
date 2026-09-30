import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
  IMergeCategoryUseCase,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import { Global, Module } from '@nestjs/common';
import { CreateCategoryUseCase } from './create-category.use-case';
import { GetCategoryTreeUseCase } from './get-category-tree.use-case';
import { MergeCategoryUseCase } from './merge-category.use-case';
import { UpdateCategoryUseCase } from './update-category.use-case';

@Global()
@Module({
  providers: [
    { provide: IUpdateCategoryUseCase, useClass: UpdateCategoryUseCase },
    { provide: ICreateCategoryUseCase, useClass: CreateCategoryUseCase },
    { provide: IGetCategoryTreeUseCase, useClass: GetCategoryTreeUseCase },
    { provide: IMergeCategoryUseCase, useClass: MergeCategoryUseCase },
  ],
  exports: [
    IUpdateCategoryUseCase,
    ICreateCategoryUseCase,
    IGetCategoryTreeUseCase,
    IMergeCategoryUseCase,
  ],
})
export class CategoryModule {}
