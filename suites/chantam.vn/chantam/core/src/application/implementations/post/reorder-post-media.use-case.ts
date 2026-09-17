import {
  IReorderPostMediaCommand,
  IReorderPostMediaResult,
  IReorderPostMediaUseCase,
} from '@/application/contracts/post';
import {
  PostMediaOrderInvalidException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ReorderPostMediaUseCase implements IReorderPostMediaUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
  ) {}

  public async handle(
    command: IReorderPostMediaCommand,
  ): Promise<IReorderPostMediaResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    const media = await this.postMediaRepository.replaceOrder(
      command.postId,
      command.media.mediaIds,
    );
    if (!media) throw new PostMediaOrderInvalidException();

    return { media };
  }
}
