import { Module } from '@nestjs/common';
import { AuthControllerModule } from './auth/auth.module';
import { CategoryControllerModule } from './category/category.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';
import { PostControllerModule } from './post/post.module';
import { ProfileControllerModule } from './profile/profile.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [
    AuthControllerModule,
    CategoryControllerModule,
    GiftPostControllerModule,
    PostControllerModule,
    ProfileControllerModule,
  ],
})
export class ApiModule {}
