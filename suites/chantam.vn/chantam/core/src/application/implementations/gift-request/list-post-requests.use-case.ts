import {
  IListPostRequestsCommand,
  IListPostRequestsResult,
  IListPostRequestsUseCase,
} from '@/application/contracts/gift-request';
import { PostNotFoundException } from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListPostRequestsUseCase implements IListPostRequestsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
  ) {}

  public async handle(
    command: IListPostRequestsCommand,
  ): Promise<IListPostRequestsResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });

    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);

    if (
      post.authorId !== command.currentUserId &&
      command.currentUserRole !== 'admin' &&
      command.currentUserRole !== 'moderator'
    ) {
      throw new ForbiddenException();
    }

    const requests = await this.giftRequestRepository.listByPostId(
      command.postId,
    );
    return {
      requests,
      total: requests.length,
    };
  }
}
