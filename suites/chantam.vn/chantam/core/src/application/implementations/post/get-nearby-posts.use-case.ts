import {
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult,
  IGetNearbyPostsUseCase,
} from '@/application/contracts/post';
import { DiscoveryOriginUnavailableException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentReactionRepository,
  IGiftRequestRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ContentSubjectTypes,
  GiftRequestStatuses,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
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
    @Inject(IPostMediaRepository)
    private readonly postMediaRepository: IPostMediaRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IContentReactionRepository)
    private readonly reactions: IContentReactionRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  /**
   * Chọn gốc toạ độ để quét (F26).
   *
   * Ưu tiên toạ độ client gửi (thường là GPS), rồi tới Vị trí mặc định của
   * người đang đăng nhập. Hết cả hai thì KHÔNG bịa ra một toạ độ mặc định —
   * trả kết quả quanh một điểm người dùng không chọn là nói sai về thứ họ
   * đang xem — mà bỏ hẳn bộ lọc bán kính và trả toàn bộ.
   */
  private async resolveOrigin(command: IGetNearbyPostsCommand): Promise<{
    origin?: { lat: number; lng: number };
    originSource: 'REQUEST' | 'DEFAULT_LOCATION' | 'ALL';
  }> {
    if (command.lat !== undefined && command.lng !== undefined)
      return {
        origin: { lat: command.lat, lng: command.lng },
        originSource: 'REQUEST',
      };

    // Gửi một nửa toạ độ là lỗi của client, không phải ý muốn quét toàn bộ —
    // im lặng bỏ qua nửa kia sẽ trả về một tập hoàn toàn khác chỗ client đang
    // chỉ tới. Đây là nhánh DUY NHẤT còn báo lỗi.
    if (command.lat !== undefined || command.lng !== undefined)
      throw new DiscoveryOriginUnavailableException();

    if (!command.currentUserId) return { originSource: 'ALL' };

    const user = await this.userRepository.findOneBy({
      globalId: command.currentUserId,
    });
    if (!user?.defaultLocation) return { originSource: 'ALL' };

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
      // Bán kính chỉ có nghĩa khi có tâm. Truyền nó xuống mà không có gốc là
      // mời tầng repository lọc quanh một điểm không tồn tại.
      radiusMeters: origin === undefined ? undefined : command.radiusMeters,
      postType: command.postType,
      categoryId: command.categoryId,
      // Cắt khoảng trắng và bỏ hẳn nếu rỗng: chuỗi rỗng lọt xuống
      // `plainto_tsquery` cho ra một truy vấn không khớp gì, và người dùng
      // thấy "không có kết quả" cho một ô tìm kiếm họ chưa gõ.
      keyword: command.keyword?.trim() || undefined,
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

    // Một truy vấn cho cả trang, y như đếm và cảm xúc: hỏi ảnh từng bài là 20
    // lần đi database mỗi lần cuộn feed.
    const allMedia =
      postIds.length > 0
        ? await this.postMediaRepository.listByPostIds(postIds)
        : [];

    const mediaMap = new Map<
      string,
      Array<{ id: number; url: string; sortOrder: number }>
    >();
    for (const item of allMedia) {
      const url = `${this.config.storage.publicBaseUrl.replace(/\/$/, '')}/${item.r2Key}`;
      const entry = { id: item.id, url, sortOrder: item.sortOrder };
      const list = mediaMap.get(item.postId);
      if (list) {
        list.push(entry);
      } else {
        mediaMap.set(item.postId, [entry]);
      }
    }

    // Một truy vấn cho cả trang — hỏi từng bài là 20 lần đi database mỗi lần cuộn.
    const myReactions =
      postIds.length > 0 && command.currentUserId
        ? await this.reactions.findMyReactions(
            ContentSubjectTypes.POST,
            postIds,
            command.currentUserId,
          )
        : new Map<string, ReactionKinds>();

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
          distanceMeters:
            distanceMeters === null ? null : bucketDistance(distanceMeters),
          isLocationApproximate: true,
          media: (mediaMap.get(post.globalId) ?? []).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          ),
          requestCount: requestCounts.get(post.globalId) ?? 0,
          myRequestStatus,
          hasRequested: Boolean(myRequestStatus),
          reactionCount: post.reactionCount,
          commentCount: post.commentCount,
          shareCount: post.shareCount,
          myReaction: myReactions.get(post.globalId) ?? null,
        };
      }),
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
      originSource,
    };
  }
}
