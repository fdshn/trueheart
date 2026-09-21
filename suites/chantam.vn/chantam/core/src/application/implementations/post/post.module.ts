import {
  IAttachPostMediaUseCase,
  ICreatePostUseCase,
  IDeletePostUseCase,
  IExpireDuePostsUseCase,
  IGetMyPostsUseCase,
  IGetNearbyPostsUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IGetSmartMatchesUseCase,
  IModeratePostUseCase,
  IRemovePostMediaUseCase,
  IRenewPostUseCase,
  IReorderPostMediaUseCase,
  IRequestPostMediaUploadUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { GetSmartMatchesUseCase } from '../smart-match/get-smart-matches.use-case';
import { AttachPostMediaUseCase } from './attach-post-media.use-case';
import { CreatePostUseCase } from './create-post.use-case';
import { DeletePostUseCase } from './delete-post.use-case';
import { ExpireDuePostsUseCase } from './expire-due-posts.use-case';
import { GetMyPostsUseCase } from './get-my-posts.use-case';
import { GetNearbyPostsUseCase } from './get-nearby-posts.use-case';
import { GetPostMapUseCase } from './get-post-map.use-case';
import { GetPostUseCase } from './get-post.use-case';
import { ModeratePostUseCase } from './moderate-post.use-case';
import { RemovePostMediaUseCase } from './remove-post-media.use-case';
import { RenewPostUseCase } from './renew-post.use-case';
import { ReorderPostMediaUseCase } from './reorder-post-media.use-case';
import { RequestPostMediaUploadUseCase } from './request-post-media-upload.use-case';
import { UpdatePostUseCase } from './update-post.use-case';

@Global()
@Module({
  providers: [
    { provide: IAttachPostMediaUseCase, useClass: AttachPostMediaUseCase },
    { provide: ICreatePostUseCase, useClass: CreatePostUseCase },
    { provide: IDeletePostUseCase, useClass: DeletePostUseCase },
    { provide: IExpireDuePostsUseCase, useClass: ExpireDuePostsUseCase },
    { provide: IGetMyPostsUseCase, useClass: GetMyPostsUseCase },
    { provide: IGetNearbyPostsUseCase, useClass: GetNearbyPostsUseCase },
    { provide: IGetSmartMatchesUseCase, useClass: GetSmartMatchesUseCase },
    { provide: IGetPostMapUseCase, useClass: GetPostMapUseCase },
    { provide: IGetPostUseCase, useClass: GetPostUseCase },
    { provide: IModeratePostUseCase, useClass: ModeratePostUseCase },
    {
      provide: IRequestPostMediaUploadUseCase,
      useClass: RequestPostMediaUploadUseCase,
    },
    { provide: IReorderPostMediaUseCase, useClass: ReorderPostMediaUseCase },
    { provide: IRemovePostMediaUseCase, useClass: RemovePostMediaUseCase },
    { provide: IRenewPostUseCase, useClass: RenewPostUseCase },
    { provide: IUpdatePostUseCase, useClass: UpdatePostUseCase },
  ],
  exports: [
    IAttachPostMediaUseCase,
    ICreatePostUseCase,
    IDeletePostUseCase,
    IExpireDuePostsUseCase,
    IGetMyPostsUseCase,
    IGetNearbyPostsUseCase,
    IGetSmartMatchesUseCase,
    IGetPostMapUseCase,
    IGetPostUseCase,
    IModeratePostUseCase,
    IRequestPostMediaUploadUseCase,
    IReorderPostMediaUseCase,
    IRemovePostMediaUseCase,
    IRenewPostUseCase,
    IUpdatePostUseCase,
  ],
})
export class PostModule {}
