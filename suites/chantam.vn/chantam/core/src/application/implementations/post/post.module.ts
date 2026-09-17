import {
  ICreatePostUseCase,
  IGetPostMapUseCase,
  IGetPostUseCase,
  IModeratePostUseCase,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { CreatePostUseCase } from './create-post.use-case';
import { GetPostMapUseCase } from './get-post-map.use-case';
import { GetPostUseCase } from './get-post.use-case';
import { ModeratePostUseCase } from './moderate-post.use-case';
import { UpdatePostUseCase } from './update-post.use-case';

@Global()
@Module({
  providers: [
    { provide: ICreatePostUseCase, useClass: CreatePostUseCase },
    { provide: IGetPostMapUseCase, useClass: GetPostMapUseCase },
    { provide: IGetPostUseCase, useClass: GetPostUseCase },
    { provide: IModeratePostUseCase, useClass: ModeratePostUseCase },
    { provide: IUpdatePostUseCase, useClass: UpdatePostUseCase },
  ],
  exports: [
    ICreatePostUseCase,
    IGetPostMapUseCase,
    IGetPostUseCase,
    IModeratePostUseCase,
    IUpdatePostUseCase,
  ],
})
export class PostModule {}
