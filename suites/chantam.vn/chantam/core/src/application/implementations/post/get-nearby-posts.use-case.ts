import {
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult,
  IGetNearbyPostsUseCase,
} from '@/application/contracts/post';
import { DiscoveryOriginUnavailableException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IGiftRequestRepository,
  IPostRepository,
  IUserRepository,
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
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  /**
   * Chọn gốc toạ độ để quét (F26).
   *
   * Ưu tiên toạ độ client gửi (thường là GPS). Thiếu thì lùi về Vị trí mặc
   * định của người đang đăng nhập. Không có cả hai thì báo lỗi rõ ràng chứ
   * KHÔNG lặng lẽ chọn một toạ độ mặc định nào — trả kết quả quanh một điểm
   * người dùng không chọn là nói sai về thứ họ đang xem.
   */
  private async resolveOrigin(command: IGetNearbyPostsCommand): Promise<{
    origin: { lat: number; lng: number };
    originSource: 'REQUEST' | 'DEFAULT_LOCATION';
  }> {
    if (command.lat !== undefined && command.lng !== undefined)
      return {
        origin: { lat: command.lat, lng: command.lng },
        originSource: 'REQUEST',
      };

    // Gửi một nửa toạ độ là lỗi của client, không phải ý muốn lùi về vị trí
    // mặc định — im lặng bỏ qua nửa kia sẽ quét quanh một chỗ khác hẳn.
    if (command.lat !== undefined || command.lng !== undefined)
      throw new DiscoveryOriginUnavailableException();

    if (!command.currentUserId) throw new DiscoveryOriginUnavailableException();

    const user = await this.userRepository.findOneBy({
      globalId: command.currentUserId,
    });
    if (!user?.defaultLocation) throw new DiscoveryOriginUnavailableException();

    return {
      origin: user.defaultLocation,
      originSource: 'DEFAULT_LOCATION',
    };
  }

  public async handle(
    command: IGetNearbyPostsCommand,
  ): Promise<IGetNearbyPostsResult> {
    const { skip, take } = toSkipTake(command);
    const { origin, originSource } = await this.resolveOrigin(command);
    const { items, total } = await this.postRepository.findNearbyPosts({
      origin,
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
      originSource,
    };
  }
}
