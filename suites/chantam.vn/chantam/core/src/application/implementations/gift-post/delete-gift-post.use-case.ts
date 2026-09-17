import {
  IDeleteGiftPostCommand,
  IDeleteGiftPostResult,
  IDeleteGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DeleteGiftPostUseCase implements IDeleteGiftPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(
    command: IDeleteGiftPostCommand,
  ): Promise<IDeleteGiftPostResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.giftPostId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.giftPostId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    const deletedAt = new Date();
    await this.postRepository.update(
      { globalId: command.giftPostId },
      { deletedAt, status: GiftPostStatuses.CANCELLED },
    );

    return { giftPostId: command.giftPostId, deletedAt };
  }
}
