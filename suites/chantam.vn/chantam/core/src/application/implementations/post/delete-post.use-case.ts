import {
  IDeletePostCommand,
  IDeletePostResult,
  IDeletePostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DeletePostUseCase implements IDeletePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(command: IDeletePostCommand): Promise<IDeletePostResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    await this.postRepository.update(
      { globalId: command.postId },
      { deletedAt: new Date(), status: GiftPostStatuses.CANCELLED },
    );

    return {};
  }
}
