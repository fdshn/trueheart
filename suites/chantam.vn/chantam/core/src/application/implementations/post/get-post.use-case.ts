import {
  IGetPostCommand,
  IGetPostResult,
  IGetPostUseCase,
} from '@/application/contracts/post';
import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPostUseCase implements IGetPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(command: IGetPostCommand): Promise<IGetPostResult> {
    const post = await this.postRepository.findPublicByGlobalId(command.postId);

    if (!post) throw new PostNotFoundException(command.postId);

    post.location = applyGeoJitter(
      post.location,
      post.globalId,
      this.config.geo.jitterRadiusMeters,
    );

    const media = await this.postMediaRepository.listByPostId(post.globalId);

    const requestCounts = await this.giftRequestRepository.countActiveByPostIds(
      [post.globalId],
    );
    const myStatuses = command.currentUserId
      ? await this.giftRequestRepository.findStatusesByPostIdsAndRequester(
          [post.globalId],
          command.currentUserId,
        )
      : new Map<string, GiftRequestStatuses>();
    const myRequestStatus = myStatuses.get(post.globalId) ?? null;

    return {
      post,
      media: media
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .map((item) => ({
          id: item.id,
          url: `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`,
          sortOrder: item.sortOrder,
        })),
      isLocationApproximate: true,
      requestCount: requestCounts.get(post.globalId) ?? 0,
      myRequestStatus,
      hasRequested: Boolean(myRequestStatus),
    };
  }
}
