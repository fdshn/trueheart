import {
  ICreateGiftPostCommand,
  ICreateGiftPostResult,
  ICreateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { IGiftPostRepository } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { GiftPostId } from '@chantam.vn/chantam.core-lib/values';
import { slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateGiftPostUseCase implements ICreateGiftPostUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
  ) {}

  public async handle(
    command: ICreateGiftPostCommand,
  ): Promise<ICreateGiftPostResult> {
    const { giftPost } = command;

    const createdAt = new Date();
    const globalId = GiftPostId.create(
      giftPost.giverId,
      slugify(giftPost.title),
      createdAt.toISOString(),
    ).toString();

    const totalQuantity = giftPost.totalQuantity ?? 1;

    await this.giftPostRepository.insert({
      globalId,
      title: giftPost.title,
      description: giftPost.description,
      category: giftPost.category,
      condition: giftPost.condition,
      estimatedValue: giftPost.estimatedValue,
      location: giftPost.location,
      areaLabel: giftPost.areaLabel,
      totalQuantity,
      remainingQuantity: totalQuantity,
      giverId: giftPost.giverId,
      // Đặc tả mục 3.2: mọi bài đăng đều phải qua kiểm duyệt trước khi hiển thị.
      status: GiftPostStatuses.PENDING_REVIEW,
      deletedAt: null,
    });

    return {
      giftPost: await this.giftPostRepository.findOneByOrFail({ globalId }),
    };
  }
}
