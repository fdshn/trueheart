import { Module } from '@nestjs/common';
import { AdminPostController } from './admin-post.controller';

@Module({ controllers: [AdminPostController] })
export class AdminPostControllerModule {}
