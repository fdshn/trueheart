import {
  IGetPostMapCommand,
  IGetPostMapResult,
  IGetPostMapUseCase,
} from '@/application/contracts/post';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { mapClusterStepDegrees } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Trần số ô trả về một lần.
 *
 * Lưới chia khung nhìn thành 16 cột nên số ô thực tế hiếm khi quá vài trăm.
 * Trần này là lưới an toàn cho khung nhìn méo mó (client gửi bbox cao và hẹp),
 * và khi chạm trần thì `truncated` nói rõ — khác hẳn bản cũ cắt ở 200 marker mà
 * im lặng.
 */
const MaxCellsPerRequest = 500;

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

    const publicBase = this.config.storage.publicBaseUrl.replace(/\/$/, '');
    const stepDegrees = mapClusterStepDegrees(command.minLng, command.maxLng);

    const { clusters, total, cellCount } =
      await this.postRepository.findMapClusters({
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
        stepDegrees,
        cellLimit: MaxCellsPerRequest,
      });

    return {
      clusters: clusters.map((cluster) => ({
        cellKey: `${cluster.cellLng}:${cluster.cellLat}`,
        count: cluster.count,
        // Ô nhiều bài thì vẽ ở TÂM Ô, không phải trọng tâm các bài: trọng tâm
        // của hai bài cùng một địa chỉ chính là địa chỉ đó. Ô đúng một bài thì
        // dùng toạ độ đã làm nhiễu, y như mọi chỗ khác trong hệ thống.
        location:
          cluster.marker === null
            ? {
                lat: cluster.cellLat + stepDegrees / 2,
                lng: cluster.cellLng + stepDegrees / 2,
              }
            : applyGeoJitter(
                cluster.marker.location,
                cluster.marker.globalId,
                this.config.geo.jitterRadiusMeters,
              ),
        isLocationApproximate: true as const,
        marker:
          cluster.marker === null
            ? null
            : {
                postId: cluster.marker.globalId,
                postType: cluster.marker.postType,
                categoryId: cluster.marker.categoryId,
                areaLabel: cluster.marker.areaLabel,
                location: applyGeoJitter(
                  cluster.marker.location,
                  cluster.marker.globalId,
                  this.config.geo.jitterRadiusMeters,
                ),
                ...(cluster.marker.distanceMeters === undefined
                  ? {}
                  : {
                      distanceMeters: bucketDistance(
                        cluster.marker.distanceMeters,
                      ),
                    }),
                isLocationApproximate: true as const,
                title: cluster.marker.title,
                isSos: cluster.marker.isSos,
                thumbnailUrl: cluster.marker.thumbnailKey
                  ? `${publicBase}/${cluster.marker.thumbnailKey}`
                  : null,
                // Chỉ đường dẫn tương đối: ghép tên miền hộ client là sinh ra
                // link chết khi đổi môi trường triển khai (F29).
                deepLinkPath: `/posts/${cluster.marker.globalId}`,
              },
      })),
      total,
      cellSizeDegrees: stepDegrees,
      truncated: cellCount > clusters.length,
    };
  }
}
