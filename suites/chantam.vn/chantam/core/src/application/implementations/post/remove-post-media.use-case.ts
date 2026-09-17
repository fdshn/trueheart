import {
  IRemovePostMediaCommand,
  IRemovePostMediaResult,
  IRemovePostMediaUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemovePostMediaUseCase implements IRemovePostMediaUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
  ) {}

  public async handle(
    command: IRemovePostMediaCommand,
  ): Promise<IRemovePostMediaResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    if (
      !(await this.postMediaRepository.removeByPostId(
        command.postId,
        command.mediaId,
      ))
    )
      throw new PostNotFoundException(command.postId);

    return {};
  }
}
