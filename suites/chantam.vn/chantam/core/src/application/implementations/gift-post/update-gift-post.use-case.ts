import {
  IUpdateGiftPostCommand,
  IUpdateGiftPostResult,
  IUpdateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import {
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { definedProps } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { toLegacyGiftPost } from './gift-post-compat.mapper';

@Injectable()
export class UpdateGiftPostUseCase implements IUpdateGiftPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(
    command: IUpdateGiftPostCommand,
  ): Promise<IUpdateGiftPostResult> {
    const existing = await this.postRepository.findOneBy({
      globalId: command.giftPostId,
    });
    if (!existing || existing.deletedAt)
      throw new PostNotFoundException(command.giftPostId);
    if (existing.authorId !== command.userId) throw new ForbiddenException();
    if (command.giftPost.status !== undefined)
      throw new PostInvalidStateException();

    const update = definedProps({
      title: command.giftPost.title,
      description: command.giftPost.description,
      areaLabel: command.giftPost.areaLabel,
      details:
        command.giftPost.condition === undefined &&
        command.giftPost.estimatedValue === undefined
          ? undefined
          : {
              ...existing.details,
              ...(command.giftPost.condition === undefined
                ? {}
                : { condition: command.giftPost.condition }),
              ...(command.giftPost.estimatedValue === undefined
                ? {}
                : { estimatedValue: command.giftPost.estimatedValue }),
            },
    });

    await this.postRepository.update({ globalId: command.giftPostId }, update);

    return {
      giftPost: toLegacyGiftPost(
        await this.postRepository.findOneByOrFail({
          globalId: command.giftPostId,
        }),
      ),
    };
  }
}
