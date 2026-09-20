import {
  IAttachPostMediaUseCase,
  ICreatePostUseCase,
  IDeletePostUseCase,
  IExpireDuePostsUseCase,
  IGetAdminPostUseCase,
  IGetMyPostsUseCase,
  IGetNearbyPostsUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IGetSmartMatchesUseCase,
  IListAdminPostsUseCase,
  IModerateAdminPostUseCase,
  IModeratePostUseCase,
  IRemovePostMediaUseCase,
  IRenewPostUseCase,
  IReorderPostMediaUseCase,
  IRequestCharityTransferUseCase,
  IRequestPostMediaUploadUseCase,
  IReviewCharityTransferUseCase,
  ITogglePostLikeUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { GetSmartMatchesUseCase } from '../smart-match/get-smart-matches.use-case';
import {
  GetAdminPostUseCase,
  ListAdminPostsUseCase,
  ModerateAdminPostUseCase,
} from './admin-post.use-cases';
import { AttachPostMediaUseCase } from './attach-post-media.use-case';
import {
  RequestCharityTransferUseCase,
  ReviewCharityTransferUseCase,
} from './charity-transfer.use-cases';
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
import { TogglePostLikeUseCase } from './toggle-post-like.use-case';
import { UpdatePostUseCase } from './update-post.use-case';

@Global()
@Module({
  providers: [
    { provide: IAttachPostMediaUseCase, useClass: AttachPostMediaUseCase },
    { provide: IGetAdminPostUseCase, useClass: GetAdminPostUseCase },
    { provide: IListAdminPostsUseCase, useClass: ListAdminPostsUseCase },
    { provide: IModerateAdminPostUseCase, useClass: ModerateAdminPostUseCase },
    { provide: ICreatePostUseCase, useClass: CreatePostUseCase },
    {
      provide: IRequestCharityTransferUseCase,
      useClass: RequestCharityTransferUseCase,
    },
    {
      provide: IReviewCharityTransferUseCase,
      useClass: ReviewCharityTransferUseCase,
    },
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
    { provide: ITogglePostLikeUseCase, useClass: TogglePostLikeUseCase },
    { provide: IUpdatePostUseCase, useClass: UpdatePostUseCase },
  ],
  exports: [
    IAttachPostMediaUseCase,
    IGetAdminPostUseCase,
    IListAdminPostsUseCase,
    IModerateAdminPostUseCase,
    ICreatePostUseCase,
    IDeletePostUseCase,
    IRequestCharityTransferUseCase,
    IReviewCharityTransferUseCase,
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
    ITogglePostLikeUseCase,
    IUpdatePostUseCase,
  ],
})
export class PostModule {}
