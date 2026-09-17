import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import { Global, Module } from '@nestjs/common';
import { CreateCategoryUseCase } from './create-category.use-case';
import { GetCategoryTreeUseCase } from './get-category-tree.use-case';
import { UpdateCategoryUseCase } from './update-category.use-case';

@Global()
@Module({
  providers: [
    { provide: IUpdateCategoryUseCase, useClass: UpdateCategoryUseCase },
    { provide: ICreateCategoryUseCase, useClass: CreateCategoryUseCase },
    { provide: IGetCategoryTreeUseCase, useClass: GetCategoryTreeUseCase },
  ],
  exports: [
    IUpdateCategoryUseCase,
    ICreateCategoryUseCase,
    IGetCategoryTreeUseCase,
  ],
})
export class CategoryModule {}
