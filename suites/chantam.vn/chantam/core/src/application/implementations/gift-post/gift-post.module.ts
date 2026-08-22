import {
  ICreateGiftPostUseCase,
  IDeleteGiftPostUseCase,
  IGetGiftPostUseCase,
  IGetNearbyGiftPostsUseCase,
  IUpdateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { Global, Module } from '@nestjs/common';
import { CreateGiftPostUseCase } from './create-gift-post.use-case';
import { DeleteGiftPostUseCase } from './delete-gift-post.use-case';
import { GetGiftPostUseCase } from './get-gift-post.use-case';
import { GetNearbyGiftPostsUseCase } from './get-nearby-gift-posts.use-case';
import { UpdateGiftPostUseCase } from './update-gift-post.use-case';

/**
 * Một module cho một resource (INVARIANTS.md mục 2) — gom toàn bộ use case của
 * bài đăng, không tách mỗi use case một module.
 */
@Global()
@Module({
  providers: [
    { provide: ICreateGiftPostUseCase, useClass: CreateGiftPostUseCase },
    { provide: IGetGiftPostUseCase, useClass: GetGiftPostUseCase },
    {
      provide: IGetNearbyGiftPostsUseCase,
      useClass: GetNearbyGiftPostsUseCase,
    },
    { provide: IUpdateGiftPostUseCase, useClass: UpdateGiftPostUseCase },
    { provide: IDeleteGiftPostUseCase, useClass: DeleteGiftPostUseCase },
  ],
  exports: [
    ICreateGiftPostUseCase,
    IGetGiftPostUseCase,
    IGetNearbyGiftPostsUseCase,
    IUpdateGiftPostUseCase,
    IDeleteGiftPostUseCase,
  ],
})
export class GiftPostModule {}
