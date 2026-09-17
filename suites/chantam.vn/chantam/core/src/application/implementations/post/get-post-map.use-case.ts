import {
  IGetPostMapCommand,
  IGetPostMapResult,
  IGetPostMapUseCase,
} from '@/application/contracts/post';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetPostMapUseCase implements IGetPostMapUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(command: IGetPostMapCommand): Promise<IGetPostMapResult> {
    if (command.minLat >= command.maxLat || command.minLng >= command.maxLng)
      throw new ValidationFailedException(['bbox phải có min nhỏ hơn max']);

    const markers = await this.postRepository.findMapMarkers({
      minLat: command.minLat,
      maxLat: command.maxLat,
      minLng: command.minLng,
      maxLng: command.maxLng,
      origin:
        command.originLat === undefined || command.originLng === undefined
          ? undefined
          : { lat: command.originLat, lng: command.originLng },
      postType: command.postType,
      categoryId: command.categoryId,
    });

    return {
      markers: markers.map((marker) => ({
        postId: marker.globalId,
        postType: marker.postType,
        categoryId: marker.categoryId,
        areaLabel: marker.areaLabel,
        location: applyGeoJitter(
          marker.location,
          marker.globalId,
          this.config.geo.jitterRadiusMeters,
        ),
        ...(marker.distanceMeters === undefined
          ? {}
          : { distanceMeters: bucketDistance(marker.distanceMeters) }),
        isLocationApproximate: true,
      })),
    };
  }
}
