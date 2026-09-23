import { Module } from '@nestjs/common';
import { AdminCategoryController } from './admin-category.controller';
import { CategoryController } from './category.controller';
@Module({ controllers: [CategoryController, AdminCategoryController] })
export class CategoryControllerModule {}
