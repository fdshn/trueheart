import {
  IFindNearbyParams,
  IFindNearbyResult,
  IGiftPostRepository,
} from '@/domain/ports/repository';
import { PubliclyVisibleGiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GeoQueryHelper } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

const DistanceAlias = 'distance_meters';

@Injectable()
export class GiftPostRepository
  extends Repository<IGiftPostEntity>
  implements IGiftPostRepository
{
  public constructor(
    @Inject(IGiftPostEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  /**
   * Truy vấn "quanh đây" — nghiệp vụ lõi của sản phẩm.
   *
   * `ST_DWithin` dùng được index GiST nên chỉ chạm vào các bản ghi thực sự nằm
   * trong bán kính, thay vì nạp cả bảng lên rồi lọc bằng Haversine ở tầng ứng dụng.
   */
  public async findNearby(
    params: IFindNearbyParams,
  ): Promise<IFindNearbyResult> {
    const { origin, radiusMeters, category, skip, take } = params;

    const baseQuery = this.createQueryBuilder('post')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      });

    if (category) baseQuery.andWhere('post.category = :category', { category });

    GeoQueryHelper.applyRadiusFilter(baseQuery, 'post', {
      ...origin,
      radiusMeters,
    });

    // Đếm trước khi thêm cột khoảng cách: SELECT phụ làm hỏng câu COUNT.
    const total = await baseQuery.getCount();

    if (total === 0) return { items: [], total };

    const listQuery = baseQuery.clone();

    GeoQueryHelper.selectDistance(listQuery, 'post', origin, DistanceAlias);
    GeoQueryHelper.orderByDistance(listQuery, 'post', origin);

    // Dùng offset/limit thay vì skip/take: skip/take khiến TypeORM chuyển sang
    // truy vấn hai bước và làm mất các cột raw như distance_meters.
    listQuery.offset(skip).limit(take);

    const { entities, raw } =
      await listQuery.getRawAndEntities<Record<string, unknown>>();

    return {
      items: entities.map((giftPost, index) => ({
        giftPost,
        distanceMeters: Number(raw[index]?.[DistanceAlias] ?? 0),
      })),
      total,
    };
  }
}
