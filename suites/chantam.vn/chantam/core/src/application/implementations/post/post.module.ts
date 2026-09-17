import {
  IAttachPostMediaUseCase,
  ICreatePostUseCase,
  ICreateWantedPostUseCase,
  IDeletePostUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IModeratePostUseCase,
  IRemovePostMediaUseCase,
  IReorderPostMediaUseCase,
  IRequestPostMediaUploadUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { AttachPostMediaUseCase } from './attach-post-media.use-case';
import { CreatePostUseCase } from './create-post.use-case';
import { CreateWantedPostUseCase } from './create-wanted-post.use-case';
import { DeletePostUseCase } from './delete-post.use-case';
import { GetPostMapUseCase } from './get-post-map.use-case';
import { GetPostUseCase } from './get-post.use-case';
import { ModeratePostUseCase } from './moderate-post.use-case';
import { RemovePostMediaUseCase } from './remove-post-media.use-case';
import { ReorderPostMediaUseCase } from './reorder-post-media.use-case';
import { RequestPostMediaUploadUseCase } from './request-post-media-upload.use-case';
import { UpdatePostUseCase } from './update-post.use-case';

@Global()
@Module({
  providers: [
    { provide: IAttachPostMediaUseCase, useClass: AttachPostMediaUseCase },
    { provide: ICreatePostUseCase, useClass: CreatePostUseCase },
    { provide: ICreateWantedPostUseCase, useClass: CreateWantedPostUseCase },
    { provide: IDeletePostUseCase, useClass: DeletePostUseCase },
    { provide: IGetPostMapUseCase, useClass: GetPostMapUseCase },
    { provide: IGetPostUseCase, useClass: GetPostUseCase },
    { provide: IModeratePostUseCase, useClass: ModeratePostUseCase },
    {
      provide: IRequestPostMediaUploadUseCase,
      useClass: RequestPostMediaUploadUseCase,
    },
    { provide: IReorderPostMediaUseCase, useClass: ReorderPostMediaUseCase },
    { provide: IRemovePostMediaUseCase, useClass: RemovePostMediaUseCase },
    { provide: IUpdatePostUseCase, useClass: UpdatePostUseCase },
  ],
  exports: [
    IAttachPostMediaUseCase,
    ICreatePostUseCase,
    ICreateWantedPostUseCase,
    IDeletePostUseCase,
    IGetPostMapUseCase,
    IGetPostUseCase,
    IModeratePostUseCase,
    IRequestPostMediaUploadUseCase,
    IReorderPostMediaUseCase,
    IRemovePostMediaUseCase,
    IUpdatePostUseCase,
  ],
})
export class PostModule {}
