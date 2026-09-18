import {
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult,
  IGetNearbyPostsUseCase,
} from '@/application/contracts/post';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
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

    return {
      posts: items.map(({ post, distanceMeters }) => ({
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
      })),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
