import {
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult,
  IGetNearbyPostsUseCase,
} from '@/application/contracts/post';
import {
  DiscoveryDefaultRadiusConfigKey,
  DiscoveryMaxRadiusConfigKey,
  DiscoveryRadiusCapabilityCode,
  normalizeDiscoveryRadiusMeters,
  normalizeGuestMaxRadiusMeters,
} from '@/domain/consts';
import { DiscoveryOriginUnavailableException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IContentReactionRepository,
  IEntitlementRepository,
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
import {
  IPostAuthorDto,
  IPostRequesterPreviewDto,
  NearbyRequesterPreviewLimit,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  MaxSearchRadiusMeters,
  MinSearchRadiusMeters,
  applyGeoJitter,
  bucketDistance,
} from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { toPublicAuthor } from '../shared/public-author';

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
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IEntitlementRepository)
    @Optional()
    private readonly entitlements?: IEntitlementRepository,
  ) {}

  /**
   * Bán kính áp dụng khi client gửi toạ độ mà BỎ TRỐNG bán kính.
   *
   * Trước 30/09 ca đó cho ra `radiusMeters: undefined`, tức không có mệnh đề
   * `ST_DWithin` nào — một client gửi toạ độ suông quét CẢ NƯỚC, đúng thứ mà
   * comment của `MaxSearchRadiusMeters` nói là phải chặn. Và
   * `discovery.default_radius_meters` thì nằm trong `system_configs` không ai đọc.
   *
   * Kẹp theo hạn mức của chính người gọi: một mặc định lớn hơn hạn mức của họ là
   * tự sinh ra 422 ở dòng dưới.
   */
  private async resolveDefaultRadiusMeters(
    maxRadiusMeters: number,
  ): Promise<number> {
    return normalizeDiscoveryRadiusMeters(
      await this.adminConfig.getConfigValue(DiscoveryDefaultRadiusConfigKey),
      { min: MinSearchRadiusMeters, max: maxRadiusMeters },
      Math.min(maxRadiusMeters, Math.max(MinSearchRadiusMeters, 10_000)),
    );
  }

  private async resolveMaxRadiusMeters(userId?: string): Promise<number> {
    const guestMax = normalizeGuestMaxRadiusMeters(
      await this.adminConfig.getConfigValue(DiscoveryMaxRadiusConfigKey),
      { min: MinSearchRadiusMeters, max: MaxSearchRadiusMeters },
    );
    if (!userId || !this.entitlements) return guestMax;

    const capability = await this.entitlements.getCapability(
      userId,
      DiscoveryRadiusCapabilityCode,
    );
    if (
      !capability?.allowed ||
      capability.limit === null ||
      !Number.isFinite(capability.limit)
    )
      return guestMax;

    return Math.min(
      MaxSearchRadiusMeters,
      Math.max(MinSearchRadiusMeters, capability.limit),
    );
  }

  /**
   * Chọn gốc toạ độ để quét (F26).
   *
   * - Có `lat` + `lng`: `REQUEST`.
   * - `useDefaultLocation=true`: `DEFAULT_LOCATION` — chỉ khi client YÊU CẦU.
   * - Không gì cả: `ALL`, không đọc hồ sơ.
   *
   * Tới 21/10 server tự lùi về Vị trí mặc định khi thiếu toạ độ: client không gửi
   * gì mà kết quả bị lọc quanh một điểm nó không hề chọn, và cùng một lời gọi trả
   * khác nhau tuỳ người đăng nhập có đặt vị trí hay chưa. Không bao giờ bịa toạ độ.
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

    if (!command.useDefaultLocation) return { originSource: 'ALL' };

    // Đã YÊU CẦU "quanh vị trí của tôi" thì không lặng lẽ trả toàn bộ khi không có
    // vị trí nào: đó là một kết quả trái với thứ client vừa xin.
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
    // Tính bán kính hiệu lực TRƯỚC nhánh kiểm: cả hai ca — client gửi bán kính và
    // client bỏ trống — đều phải nằm trong hạn mức, và cả hai đều phải sinh ra một
    // mệnh đề `ST_DWithin`.
    let effectiveRadiusMeters = command.radiusMeters;
    if (origin && command.radiusMeters === undefined)
      effectiveRadiusMeters = await this.resolveDefaultRadiusMeters(
        await this.resolveMaxRadiusMeters(command.currentUserId),
      );

    if (origin && command.radiusMeters !== undefined) {
      const maxRadiusMeters = await this.resolveMaxRadiusMeters(
        command.currentUserId,
      );
      if (command.radiusMeters > maxRadiusMeters)
        throw new ValidationFailedException([
          `radiusMeters không được lớn hơn hạn mức ${maxRadiusMeters}`,
        ]);
    }
    const { items, total } = await this.postRepository.findNearbyPosts({
      origin,
      // Bán kính chỉ có nghĩa khi có tâm. Truyền nó xuống mà không có gốc là
      // mời tầng repository lọc quanh một điểm không tồn tại.
      radiusMeters: origin === undefined ? undefined : effectiveRadiusMeters,
      postType: command.postType,
      categoryId: command.categoryId,
      // Cắt khoảng trắng và bỏ hẳn nếu rỗng: chuỗi rỗng lọt xuống
      // `plainto_tsquery` cho ra một truy vấn không khớp gì, và người dùng
      // thấy "không có kết quả" cho một ô tìm kiếm họ chưa gõ.
      keyword: command.keyword?.trim() || undefined,
      // `|| undefined` chứ không truyền thẳng: `false` xuống tầng repository là
      // một mệnh đề WHERE không ai yêu cầu.
      isSos: command.isSos || undefined,
      skip,
      take,
    });

    const postIds = items.map(({ post }) => post.globalId);
    const requestCounts =
      postIds.length > 0
        ? await this.giftRequestRepository.countActiveByPostIds(postIds)
        : new Map<string, number>();
    const requesters =
      postIds.length > 0
        ? await this.giftRequestRepository.listRecentRequestersByPostIds(
            postIds,
            NearbyRequesterPreviewLimit,
          )
        : new Map<string, IPostRequesterPreviewDto[]>();
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

    // Khử trùng TRƯỚC khi hỏi: một người đăng năm bài trên cùng trang thì vẫn
    // chỉ là một hàng trong bảng users.
    const authorIds = [...new Set(items.map(({ post }) => post.authorId))];
    const authorMap = new Map<string, IPostAuthorDto>(
      (authorIds.length > 0
        ? await this.userRepository.findByGlobalIds(authorIds)
        : []
      ).map((user) => [user.globalId, toPublicAuthor(user)]),
    );

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
          author: authorMap.get(post.authorId) ?? null,
          requestCount: requestCounts.get(post.globalId) ?? 0,
          requesters: requesters.get(post.globalId) ?? [],
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
