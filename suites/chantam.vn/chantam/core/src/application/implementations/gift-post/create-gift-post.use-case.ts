import {
  ICreateGiftPostCommand,
  ICreateGiftPostResult,
  ICreateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import {
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
import { GiftPostId } from '@chantam.vn/chantam.core-lib/values';
import { slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateGiftPostUseCase implements ICreateGiftPostUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
  ) {}

  public async handle(
    command: ICreateGiftPostCommand,
  ): Promise<ICreateGiftPostResult> {
    const { giftPost } = command;
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    if (!isProfileComplete(user)) {
      const missing = [
        !user.fullName && 'Họ tên',
        !user.avatarUrl && 'Avatar',
        !user.phone && 'SĐT',
        !user.email && 'Email',
      ].filter(Boolean) as string[];
      throw new ProfileIncompleteException(missing);
    }

    const createdAt = new Date();
    const globalId = GiftPostId.create(
      command.userId,
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
      giverId: command.userId,
      // Đặc tả mục 3.2: mọi bài đăng đều phải qua kiểm duyệt trước khi hiển thị.
      status: GiftPostStatuses.PENDING_REVIEW,
      deletedAt: null,
    });

    return {
      giftPost: await this.giftPostRepository.findOneByOrFail({ globalId }),
    };
  }
}
