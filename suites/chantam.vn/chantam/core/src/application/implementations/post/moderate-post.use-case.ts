import {
  IModeratePostCommand,
  IModeratePostResult,
  IModeratePostUseCase,
} from '@/application/contracts/post';
import { PostInvalidStateException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

function publishedExpiryDate(publishedAt: Date): Date {
  const expiresAt = new Date(publishedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 3);
  return expiresAt;
}

@Injectable()
export class ModeratePostUseCase implements IModeratePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IModeratePostCommand,
  ): Promise<IModeratePostResult> {
    if (
      !this.config.postOperator.usernames.includes(
        command.username.toLowerCase(),
      )
    )
      throw new ForbiddenException();

    const status = command.post.status;
    const publishedAt =
      status === GiftPostStatuses.PUBLISHED ? new Date() : null;
    const post = await this.postRepository.transitionPendingReview(
      command.postId,
      status,
      publishedAt ? publishedExpiryDate(publishedAt) : null,
    );

    if (!post) throw new PostInvalidStateException();

    return { post };
  }
}
