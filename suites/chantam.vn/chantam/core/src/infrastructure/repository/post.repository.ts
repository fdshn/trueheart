import {
  IFindNearbyPostsParams,
  IFindNearbyPostsResult,
  IFindPostMapMarkersParams,
  IFindSmartMatchesParams,
  IPostMapMarker,
  IPostRepository,
  ISmartMatchCandidate,
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

/**
 * Những trạng thái tính vào hạn mức đăng bài.
 *
 * Export vì `EntitlementRepository` phải báo "đã dùng bao nhiêu" theo ĐÚNG định
 * nghĩa mà chỗ này chặn. Hai bên lệch nhau thì API nói một đằng, lúc đăng bài
 * chặn một nẻo.
 */
export const QuotaStatuses = [
  'PENDING_REVIEW',
  'PUBLISHED',
  'RESERVED',
  'DELIVERING',
];

/**
 * Số ứng viên lấy về trước khi chấm điểm.
 *
 * Lấy dư theo khoảng cách rồi mới xếp hạng ở tầng ứng dụng, để trọng số chỉ
 * tồn tại một nơi. Chặn trần để một danh mục đông bài trong thành phố lớn
 * không kéo cả nghìn dòng về chấm.
 */
export const SmartMatchCandidateLimit = 100;

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

  public async createPostWithinQuota(
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

  public async findSmartMatches(
    params: IFindSmartMatchesParams,
  ): Promise<ISmartMatchCandidate[]> {
    const query = this.createQueryBuilder('post')
      .where('post.deletedAt IS NULL')
      // Loại bù: bài Muốn Nhận thì đi tìm Muốn Tặng, và ngược lại.
      .andWhere('post.postType = :postType', { postType: params.postType })
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      })
      .andWhere('post.globalId != :sourcePostId', {
        sourcePostId: params.sourcePostId,
      })
      // Gợi ý bài của chính người đăng là ghép họ với chính họ.
      .andWhere('post.authorId != :excludeAuthorId', {
        excludeAuthorId: params.excludeAuthorId,
      });

    GeoQueryHelper.applyRadiusFilter(query, 'post', {
      ...params.origin,
      radiusMeters: params.radiusMeters,
    });
    GeoQueryHelper.selectDistance(
      query,
      'post',
      params.origin,
      'distance_meters',
    );

    // `simple` chứ không phải `english`: bộ từ điển tiếng Anh cắt đuôi từ theo
    // luật tiếng Anh, áp lên tiếng Việt thì token biến dạng vô nghĩa.
    const tsQuery = params.keywords.join(' | ');
    const keywordMatch = `to_tsvector('simple', coalesce(post.title, '') || ' ' || coalesce(post.description, '')) @@ to_tsquery('simple', :tsQuery)`;

    query.addSelect(tsQuery ? keywordMatch : 'false', 'keyword_matched');

    // Chỉ gần thôi thì chưa phải gợi ý: phải cùng danh mục hoặc trùng từ khoá,
    // nếu không danh sách đầy những bài chẳng liên quan gì.
    if (tsQuery)
      query.andWhere(`(post.category_id = :categoryId OR ${keywordMatch})`, {
        categoryId: params.categoryId,
        tsQuery,
      });
    else
      query.andWhere('post.category_id = :categoryId', {
        categoryId: params.categoryId,
      });

    // Lấy dư rồi chấm điểm ở tầng ứng dụng: trọng số chỉ được định nghĩa một
    // lần trong `smart-match.policy`, không chép sang SQL để rồi hai bên lệch.
    GeoQueryHelper.orderByDistance(query, 'post', params.origin);
    query.limit(SmartMatchCandidateLimit);

    const { entities, raw } =
      await query.getRawAndEntities<Record<string, unknown>>();

    return entities.map((post, index) => ({
      post,
      distanceMeters: Number(raw[index]?.distance_meters ?? 0),
      sameCategory: post.categoryId === params.categoryId,
      keywordMatched: raw[index]?.keyword_matched === true,
    }));
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

  public async countPublishedByAuthor(authorId: string): Promise<number> {
    return this.createQueryBuilder('post')
      .where('post.authorId = :authorId', { authorId })
      .andWhere('post.postType = :postType', { postType: PostTypes.OFFER })
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.status = :status', { status: 'PUBLISHED' })
      .getCount();
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
