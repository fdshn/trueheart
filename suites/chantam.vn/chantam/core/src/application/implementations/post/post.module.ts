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
  IRemovePostMediaUseCase,
  IRenewPostUseCase,
  IReorderPostMediaUseCase,
  IRequestCharityTransferUseCase,
  IRequestPostMediaUploadUseCase,
  IReviewCharityTransferUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { GiftRequestModule } from '../gift-request/gift-request.module';
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
import { RemovePostMediaUseCase } from './remove-post-media.use-case';
import { RenewPostUseCase } from './renew-post.use-case';
import { ReorderPostMediaUseCase } from './reorder-post-media.use-case';
import { RequestPostMediaUploadUseCase } from './request-post-media-upload.use-case';
import { UpdatePostUseCase } from './update-post.use-case';

@Global()
@Module({
  /**
   * `GiftRequestModule` khai TƯỜNG MINH, dù nó là `@Global()`.
   *
   * `ModerateAdminPostUseCase` và hai use case vòng đời bài đều cần
   * `CloseOpenRequestsService`, mà nó do module kia export. Trong app HTTP thì chạy
   * được chỉ vì một chỗ khác đã import `GiftRequestModule` — tức module này dựa vào
   * việc ai đó ở ngoài nhớ nạp hộ.
   *
   * Và đó đúng là bẫy 2 ở `docs/diagram/17-jobs.md` §17.3: `@Global()` chỉ có hiệu
   * lực SAU KHI được import ở đâu đó. `PostCliModule` chỉ nạp `PostModule` +
   * `CliInfrastructureModule`, nên `post:expire` chết ngay khi khởi động —
   * "Nest can't resolve dependencies … CloseOpenRequestsService at index [2]" —
   * và nó nằm trong crontab ở `11 0 * * *`, nghĩa là bài quá hạn KHÔNG được đóng
   * suốt từ lúc `CloseOpenRequestsService` ra đời.
   *
   * Khai ở đây thay vì thêm vào từng `*-cli.module.ts`: phụ thuộc thuộc về module
   * CÓ phụ thuộc, không thuộc về từng chỗ gọi nó.
   */
  imports: [GiftRequestModule],
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
    IRequestPostMediaUploadUseCase,
    IReorderPostMediaUseCase,
    IRemovePostMediaUseCase,
    IRenewPostUseCase,
    IUpdatePostUseCase,
  ],
})
export class PostModule {}
