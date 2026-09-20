import {
  IUpdatePostCommand,
  IUpdatePostResult,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses, PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
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

    const hasOfferDetails =
      command.post.condition !== undefined ||
      command.post.estimatedValue !== undefined;
    if (hasOfferDetails && post.postType !== PostTypes.OFFER)
      throw new ValidationFailedException([
        'condition và estimatedValue chỉ áp dụng cho bài OFFER',
      ]);

    const isRejected = (post.status as string) === GiftPostStatuses.REJECTED;

    await this.postRepository.update(
      { globalId: command.postId },
      definedProps({
        title: command.post.title,
        description: command.post.description,
        areaLabel: command.post.areaLabel,
        location: command.post.location
          ? {
              lat: command.post.location.lat,
              lng: command.post.location.lng,
            }
          : undefined,
        status: isRejected ? GiftPostStatuses.PENDING_REVIEW : undefined,
        details: !hasOfferDetails
          ? undefined
          : {
              ...post.details,
              ...(command.post.condition === undefined
                ? {}
                : { condition: command.post.condition }),
              ...(command.post.estimatedValue === undefined
                ? {}
                : { estimatedValue: command.post.estimatedValue }),
            },
      }),
    );

    return {
      post: await this.postRepository.findOneByOrFail({
        globalId: command.postId,
      }),
    };
  }
}
