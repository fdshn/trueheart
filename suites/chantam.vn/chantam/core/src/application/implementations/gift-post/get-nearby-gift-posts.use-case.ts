import {
  IGetNearbyGiftPostsCommand,
  IGetNearbyGiftPostsResult,
  IGetNearbyGiftPostsUseCase,
} from '@/application/contracts/gift-post';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import {
  toCanonicalCategoryId,
  toLegacyGiftPost,
} from './gift-post-compat.mapper';

@Injectable()
export class GetNearbyGiftPostsUseCase implements IGetNearbyGiftPostsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetNearbyGiftPostsCommand,
  ): Promise<IGetNearbyGiftPostsResult> {
    const { skip, take } = toSkipTake(command);

    const { items, total } = await this.postRepository.findNearbyOffers({
      origin: { lat: command.lat, lng: command.lng },
      radiusMeters: command.radiusMeters,
      categoryId: command.category
        ? toCanonicalCategoryId(command.category)
        : undefined,
      skip,
      take,
    });

    // Danh sách quanh đây luôn là kênh công khai — không bao giờ trả toạ độ thật.
    const giftPosts = items.map(({ post, distanceMeters }) => {
      const giftPost = toLegacyGiftPost(post);
      return {
        giftPost: {
          ...giftPost,
          location: applyGeoJitter(
            giftPost.location,
            giftPost.globalId,
            this.config.geo.jitterRadiusMeters,
          ),
        },
        distanceMeters: bucketDistance(distanceMeters),
        isLocationApproximate: true,
      };
    });

    return {
      giftPosts,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
