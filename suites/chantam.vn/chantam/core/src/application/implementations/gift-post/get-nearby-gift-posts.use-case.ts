import {
  IGetNearbyGiftPostsCommand,
  IGetNearbyGiftPostsResult,
  IGetNearbyGiftPostsUseCase,
} from '@/application/contracts/gift-post';
import { IConfig } from '@/domain/ports/config';
import { IGiftPostRepository } from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetNearbyGiftPostsUseCase implements IGetNearbyGiftPostsUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetNearbyGiftPostsCommand,
  ): Promise<IGetNearbyGiftPostsResult> {
    const { skip, take } = toSkipTake(command);

    const { items, total } = await this.giftPostRepository.findNearby({
      origin: { lat: command.lat, lng: command.lng },
      radiusMeters: command.radiusMeters,
      category: command.category,
      skip,
      take,
    });

    // Danh sách quanh đây luôn là kênh công khai — không bao giờ trả toạ độ thật.
    const giftPosts = items.map(({ giftPost, distanceMeters }) => ({
      giftPost: {
        ...giftPost,
        location: applyGeoJitter(
          giftPost.location,
          giftPost.globalId,
          this.config.geo.jitterRadiusMeters,
        ),
      },
      // Làm tròn thô: khoảng cách chính xác tới mét cho phép giải tam giác từ
      // ba lần truy vấn để tìm ra vị trí thật, phá vỡ tác dụng của geo-jitter.
      distanceMeters: bucketDistance(distanceMeters),
      isLocationApproximate: true,
    }));

    return {
      giftPosts,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
