import {
  ICreateGiftPostCommand,
  ICreateGiftPostResult,
  ICreateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { ICreatePostUseCase } from '@/application/contracts/post';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import {
  toCanonicalCategoryId,
  toLegacyGiftPost,
} from './gift-post-compat.mapper';

@Injectable()
export class CreateGiftPostUseCase implements ICreateGiftPostUseCase {
  public constructor(
    @Inject(ICreatePostUseCase)
    private readonly createPostUseCase: ICreatePostUseCase,
  ) {}

  public async handle(
    command: ICreateGiftPostCommand,
  ): Promise<ICreateGiftPostResult> {
    const { giftPost } = command;
    const result = await this.createPostUseCase.handle({
      userId: command.userId,
      post: {
        postType: PostTypes.OFFER,
        title: giftPost.title,
        description: giftPost.description,
        categoryId: toCanonicalCategoryId(giftPost.category),
        condition: giftPost.condition,
        estimatedValue: giftPost.estimatedValue,
        location: giftPost.location,
        areaLabel: giftPost.areaLabel,
        totalQuantity: giftPost.totalQuantity,
      },
    });

    return { giftPost: toLegacyGiftPost(result.post) };
  }
}
