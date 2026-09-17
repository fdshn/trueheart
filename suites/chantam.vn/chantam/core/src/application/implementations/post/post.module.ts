import {
  ICreatePostUseCase,
  IGetPostUseCase,
  IModeratePostUseCase,
} from '@/application/contracts/post';
import { Global, Module } from '@nestjs/common';
import { CreatePostUseCase } from './create-post.use-case';
import { GetPostUseCase } from './get-post.use-case';
import { ModeratePostUseCase } from './moderate-post.use-case';

@Global()
@Module({
  providers: [
    { provide: ICreatePostUseCase, useClass: CreatePostUseCase },
    { provide: IGetPostUseCase, useClass: GetPostUseCase },
    { provide: IModeratePostUseCase, useClass: ModeratePostUseCase },
  ],
  exports: [ICreatePostUseCase, IGetPostUseCase, IModeratePostUseCase],
})
export class PostModule {}
