import {
  IUpdatePostCommand,
  IUpdatePostResult,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { definedProps } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdatePostUseCase implements IUpdatePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(command: IUpdatePostCommand): Promise<IUpdatePostResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    await this.postRepository.update(
      { globalId: command.postId },
      definedProps(command.post),
    );

    return {
      post: await this.postRepository.findOneByOrFail({
        globalId: command.postId,
      }),
    };
  }
}
