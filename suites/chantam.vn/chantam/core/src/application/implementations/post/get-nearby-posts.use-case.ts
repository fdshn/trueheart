import {
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult,
  IGetNearbyPostsUseCase,
} from '@/application/contracts/post';
import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetNearbyPostsUseCase implements IGetNearbyPostsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetNearbyPostsCommand,
  ): Promise<IGetNearbyPostsResult> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.postRepository.findNearbyPosts({
      origin: { lat: command.lat, lng: command.lng },
      radiusMeters: command.radiusMeters,
      postType: command.postType,
      categoryId: command.categoryId,
      skip,
      take,
    });

    const postIds = items.map(({ post }) => post.globalId);
    const requestCounts =
      postIds.length > 0
        ? await this.giftRequestRepository.countActiveByPostIds(postIds)
        : new Map<string, number>();
    const myStatuses =
      postIds.length > 0 && command.currentUserId
        ? await this.giftRequestRepository.findStatusesByPostIdsAndRequester(
            postIds,
            command.currentUserId,
          )
        : new Map<string, GiftRequestStatuses>();

    return {
      posts: items.map(({ post, distanceMeters }) => {
        const myRequestStatus = myStatuses.get(post.globalId) ?? null;
        return {
          post: {
            ...post,
            location: applyGeoJitter(
              post.location,
              post.globalId,
              this.config.geo.jitterRadiusMeters,
            ),
          },
          distanceMeters: bucketDistance(distanceMeters),
          isLocationApproximate: true,
          requestCount: requestCounts.get(post.globalId) ?? 0,
          myRequestStatus,
          hasRequested: Boolean(myRequestStatus),
        };
      }),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
