import { Module } from '@nestjs/common';
import { AdminBlogController, BlogController } from './blog.controller';

@Module({ controllers: [AdminBlogController, BlogController] })
export class BlogControllerModule {}
