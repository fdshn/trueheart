import {
  ICreateWantedPostCommand,
  ICreateWantedPostResult,
  ICreateWantedPostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  PostQuotaExceededException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
import { makeGlobalId, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

const PostQuotaByRank: Readonly<Record<UserRanks, number>> = {
  [UserRanks.VIEWER]: 0,
  [UserRanks.MEMBER]: 3,
  [UserRanks.SILVER]: 10,
  [UserRanks.GOLD]: 20,
  [UserRanks.DIAMOND]: 50,
};

@Injectable()
export class CreateWantedPostUseCase implements ICreateWantedPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(ICategoryRepository)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
  ) {}

  public async handle(
    command: ICreateWantedPostCommand,
  ): Promise<ICreateWantedPostResult> {
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

    const { post } = command;
    const category = await this.categoryRepository.findOneBy({
      globalId: post.categoryId,
    });
    if (!category || category.deletedAt || !category.isActive)
      throw new CategoryNotFoundException();

    const createdAt = new Date();
    const globalId = makeGlobalId(
      `/posts/${command.userId}/${slugify(post.title)}/${createdAt.toISOString()}`,
    );
    const created = await this.postRepository.createOfferWithinQuota(
      command.userId,
      PostQuotaByRank[user.rank],
      {
        globalId,
        postType: PostTypes.WANTED,
        authorId: command.userId,
        categoryId: category.globalId,
        title: post.title,
        description: post.description,
        location: post.location,
        areaLabel: post.areaLabel,
        status: GiftPostStatuses.PENDING_REVIEW,
        totalQuantity: 1,
        remainingQuantity: 1,
        details: {},
        expiresAt: null,
        renewedCount: 0,
        deletedAt: null,
      },
    );

    if (!created)
      throw new PostQuotaExceededException(PostQuotaByRank[user.rank]);

    return {
      post: await this.postRepository.findOneByOrFail({ globalId }),
    };
  }
}
