import {
  IFindNearbyPostsParams,
  IFindNearbyPostsResult,
  IFindPostMapMarkersParams,
  IPostMapMarker,
  IPostRepository,
} from '@/domain/ports/repository';
import { PostEntity } from '@/infrastructure/entity';
import {
  PostTypes,
  PubliclyVisibleGiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { GeoQueryHelper } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

const QuotaStatuses = ['PENDING_REVIEW', 'PUBLISHED', 'RESERVED', 'DELIVERING'];

@Injectable()
export class PostRepository
  extends Repository<IPostEntity>
  implements IPostRepository
{
  public constructor(
    @Inject(IPostEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async createOfferWithinQuota(
    authorId: string,
    quota: number,
    post: Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean> {
    return this.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        authorId,
      ]);

      const openPostCount = await manager
        .createQueryBuilder(PostEntity, 'post')
        .where('post.authorId = :authorId', { authorId })
        .andWhere('post.deletedAt IS NULL')
        .andWhere('post.status IN (:...statuses)', {
          statuses: QuotaStatuses,
        })
        .getCount();

      if (openPostCount >= quota) return false;

      await manager.insert(PostEntity, post as never);
      return true;
    });
  }

  public async transitionPendingReview(
    postId: string,
    status: 'PUBLISHED' | 'REJECTED',
    expiresAt: Date | null,
  ): Promise<IPostEntity | null> {
    const result = await this.createQueryBuilder()
      .update(PostEntity)
      .set({ status: status as never, expiresAt })
      .where('global_id = :postId', { postId })
      .andWhere('deleted_at IS NULL')
      .andWhere('status = :pendingReview', {
        pendingReview: 'PENDING_REVIEW',
      })
      .execute();

    if (result.affected !== 1) return null;

    return this.findOneBy({ globalId: postId });
  }

  public async findNearbyPosts(
    params: IFindNearbyPostsParams,
  ): Promise<IFindNearbyPostsResult> {
    const baseQuery = this.createQueryBuilder('post')
      .where('post.deletedAt IS NULL')
      .andWhere('post.postType = :postType', { postType: params.postType })
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      });

    if (params.categoryId)
      baseQuery.andWhere('post.categoryId = :categoryId', {
        categoryId: params.categoryId,
      });

    GeoQueryHelper.applyRadiusFilter(baseQuery, 'post', {
      ...params.origin,
      radiusMeters: params.radiusMeters,
    });

    const total = await baseQuery.getCount();
    if (total === 0) return { items: [], total };

    const listQuery = baseQuery.clone();
    GeoQueryHelper.selectDistance(
      listQuery,
      'post',
      params.origin,
      'distance_meters',
    );
    GeoQueryHelper.orderByDistance(listQuery, 'post', params.origin);
    listQuery.offset(params.skip).limit(params.take);

    const { entities, raw } =
      await listQuery.getRawAndEntities<Record<string, unknown>>();

    return {
      items: entities.map((post, index) => ({
        post,
        distanceMeters: Number(raw[index]?.distance_meters ?? 0),
      })),
      total,
    };
  }

  public async findMapMarkers(
    params: IFindPostMapMarkersParams,
  ): Promise<IPostMapMarker[]> {
    const query = this.createQueryBuilder('post')
      .select('post.globalId', 'global_id')
      .addSelect('post.postType', 'post_type')
      .addSelect('post.categoryId', 'category_id')
      .addSelect('post.areaLabel', 'area_label')
      .addSelect('ST_Y(post.location::geometry)', 'lat')
      .addSelect('ST_X(post.location::geometry)', 'lng')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      })
      .limit(200);

    if (params.postType)
      query.andWhere('post.postType = :postType', {
        postType: params.postType,
      });
    if (params.categoryId)
      query.andWhere('post.categoryId = :categoryId', {
        categoryId: params.categoryId,
      });

    GeoQueryHelper.applyBoundingBox(query, 'post', params);

    if (params.origin)
      GeoQueryHelper.selectDistance(
        query,
        'post',
        params.origin,
        'distance_meters',
      );

    const rows = await query.getRawMany<{
      global_id: string;
      post_type: PostTypes;
      category_id: string;
      area_label: string;
      lat: string;
      lng: string;
      distance_meters?: string;
    }>();

    return rows.map((row) => ({
      globalId: row.global_id,
      postType: row.post_type,
      categoryId: row.category_id,
      areaLabel: row.area_label,
      location: { lat: Number(row.lat), lng: Number(row.lng) },
      ...(row.distance_meters === undefined
        ? {}
        : { distanceMeters: Number(row.distance_meters) }),
    }));
  }

  public async findPublicByGlobalId(
    globalId: string,
  ): Promise<IPostEntity | null> {
    return this.createQueryBuilder('post')
      .where('post.globalId = :globalId', { globalId })
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      })
      .getOne();
  }
}
