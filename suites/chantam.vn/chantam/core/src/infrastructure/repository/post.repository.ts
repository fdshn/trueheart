import {
  CharityTransferOutcome,
  IAdminPostSummary,
  IExpireDuePostsResult,
  IFindAdminPostsParams,
  IFindAdminPostsResult,
  IFindMyPostsParams,
  IFindMyPostsResult,
  IFindNearbyPostsParams,
  IFindNearbyPostsResult,
  IFindPostMapMarkersParams,
  IFindSmartMatchesParams,
  IModeratePostByAdminCommand,
  IPostMapMarker,
  IPostRepository,
  IRenewPostParams,
  IRequestCharityTransferParams,
  IReviewCharityTransferParams,
  ISmartMatchCandidate,
  RenewPostOutcome,
} from '@/domain/ports/repository';
import { PostEntity } from '@/infrastructure/entity';
import {
  CharityTransferStatuses,
  GiftPostStatuses,
  PostTypes,
  PubliclyVisibleGiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostLifetimeMonths,
  PostMaxRenewals,
  expiryConvertsToOffer,
} from '@chantam.vn/chantam.core-lib/models';
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

interface IAdminPostRow {
  global_id: string;
  post_type: PostTypes;
  author_id: string;
  author_username: string;
  author_full_name: string | null;
  category_id: string;
  title: string;
  description: string;
  area_label: string;
  status: string;
  total_quantity: number;
  remaining_quantity: number;
  details: Record<string, unknown>;
  expires_at: Date | null;
  media_count: string;
  created_at: Date;
  updated_at: Date;
}

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

  public async findMyPosts(
    params: IFindMyPostsParams,
  ): Promise<IFindMyPostsResult> {
    const query = this.createQueryBuilder('post')
      .where('post.authorId = :authorId', { authorId: params.authorId })
      // Bài đã xoá mềm thì chủ bài cũng không cần thấy nữa.
      .andWhere('post.deletedAt IS NULL');

    if (params.postType)
      query.andWhere('post.postType = :postType', {
        postType: params.postType,
      });
    // KHÔNG mặc định lọc về trạng thái công khai: chủ bài phải thấy được bài
    // đang chờ duyệt và bài bị từ chối của mình.
    if (params.status)
      query.andWhere('post.status = :status', { status: params.status });
    if (params.categoryId)
      query.andWhere('post.categoryId = :categoryId', {
        categoryId: params.categoryId,
      });

    const [items, total] = await query
      .orderBy('post.createdAt', 'DESC')
      .skip(params.skip)
      .take(params.take)
      .getManyAndCount();

    return { items, total };
  }

  public async findAdminPosts(
    params: IFindAdminPostsParams,
  ): Promise<IFindAdminPostsResult> {
    const conditions = ['post.deleted_at IS NULL'];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return;
      values.push(value);
      conditions.push(sql.replace('$?', `$${values.length}`));
    };

    add('post.status = $?', params.status);
    add('post.post_type = $?', params.postType);
    add('post.category_id = $?', params.categoryId);
    add('post.author_id = $?', params.authorId);
    if (params.keyword) {
      values.push(params.keyword);
      const keyword = `$${values.length}`;
      conditions.push(
        `(post.title ILIKE '%' || ${keyword} || '%' OR post.description ILIKE '%' || ${keyword} || '%' OR author.username ILIKE '%' || ${keyword} || '%')`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await this.manager.query<IAdminPostRow[]>(
      `
        SELECT post.global_id, post.post_type, post.author_id,
               author.username AS author_username,
               author.full_name AS author_full_name,
               post.category_id, post.title, post.description, post.area_label,
               post.status, post.total_quantity, post.remaining_quantity,
               post.details, post.expires_at, post.created_at, post.updated_at,
               COUNT(media.id)::text AS media_count
        FROM posts post
        INNER JOIN users author ON author.global_id = post.author_id
        LEFT JOIN post_media media ON media.post_id = post.global_id
        ${where}
        GROUP BY post.id, author.username, author.full_name
        ORDER BY post.created_at DESC, post.global_id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, params.take, params.skip],
    );
    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM posts post
        INNER JOIN users author ON author.global_id = post.author_id
        ${where}
      `,
      values,
    );

    return {
      items: rows.map((row) => this.mapAdminPost(row)),
      total: Number(total),
    };
  }

  public async findAdminByGlobalId(
    globalId: string,
  ): Promise<IAdminPostSummary | null> {
    // Detail cần lọc chính xác theo ID; dùng query riêng để không biến UUID
    // thành keyword và không phụ thuộc trạng thái public.
    const [row] = await this.manager.query<IAdminPostRow[]>(
      `
        SELECT post.global_id, post.post_type, post.author_id,
               author.username AS author_username,
               author.full_name AS author_full_name,
               post.category_id, post.title, post.description, post.area_label,
               post.status, post.total_quantity, post.remaining_quantity,
               post.details, post.expires_at, post.created_at, post.updated_at,
               COUNT(media.id)::text AS media_count
        FROM posts post
        INNER JOIN users author ON author.global_id = post.author_id
        LEFT JOIN post_media media ON media.post_id = post.global_id
        WHERE post.global_id = $1 AND post.deleted_at IS NULL
        GROUP BY post.id, author.username, author.full_name
      `,
      [globalId],
    );
    return row ? this.mapAdminPost(row) : null;
  }

  public async moderatePendingReviewByAdmin(
    command: IModeratePostByAdminCommand,
  ): Promise<IPostEntity | null> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<{ status: string }[]>(
        `
          SELECT status FROM posts
          WHERE global_id = $1 AND deleted_at IS NULL
          FOR UPDATE
        `,
        [command.postId],
      );
      if (current?.status !== 'PENDING_REVIEW') return null;

      await manager.query(
        `
          UPDATE posts
          SET status = $2, expires_at = $3, updated_at = now()
          WHERE global_id = $1
        `,
        [command.postId, command.status, command.expiresAt],
      );
      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
          VALUES ($1, 'MODERATE_POST', 'POST', $2, $3::jsonb, $4::jsonb, $5)
        `,
        [
          command.actorUserId,
          command.postId,
          JSON.stringify({ status: current.status }),
          JSON.stringify({ status: command.status }),
          command.reason,
        ],
      );

      return manager.findOneBy(PostEntity, { globalId: command.postId });
    });
  }

  private mapAdminPost(row: IAdminPostRow): IAdminPostSummary {
    return {
      globalId: row.global_id,
      postType: row.post_type,
      authorId: row.author_id,
      authorUsername: row.author_username,
      authorFullName: row.author_full_name,
      categoryId: row.category_id,
      title: row.title,
      description: row.description,
      areaLabel: row.area_label,
      status: row.status,
      totalQuantity: Number(row.total_quantity),
      remainingQuantity: Number(row.remaining_quantity),
      details: row.details ?? {},
      expiresAt: row.expires_at,
      mediaCount: Number(row.media_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
      .addSelect('post.title', 'title')
      .addSelect('post.isSos', 'is_sos')
      .addSelect('ST_Y(post.location::geometry)', 'lat')
      .addSelect('ST_X(post.location::geometry)', 'lng')
      // Ảnh đầu tiên cho thẻ xem nhanh (F29). LATERAL + LIMIT 1 để mỗi bài
      // vẫn ra đúng một dòng — JOIN thẳng vào post_media sẽ nhân bản marker
      // theo số ảnh, và bản đồ hiện 5 pin trùng chỗ cho một bài 5 ảnh.
      .addSelect(
        `(SELECT m.r2_key FROM post_media m
           WHERE m.post_id = post.global_id
           ORDER BY m.sort_order ASC, m.id ASC
           LIMIT 1)`,
        'thumbnail_key',
      )
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
      title: string;
      is_sos: boolean;
      thumbnail_key: string | null;
      lat: string;
      lng: string;
      distance_meters?: string;
    }>();

    return rows.map((row) => ({
      globalId: row.global_id,
      postType: row.post_type,
      categoryId: row.category_id,
      areaLabel: row.area_label,
      title: row.title,
      isSos: Boolean(row.is_sos),
      thumbnailKey: row.thumbnail_key,
      location: { lat: Number(row.lat), lng: Number(row.lng) },
      ...(row.distance_meters === undefined
        ? {}
        : { distanceMeters: Number(row.distance_meters) }),
    }));
  }

  public async expireDuePosts(now: Date): Promise<IExpireDuePostsResult> {
    return this.manager.transaction(async (manager) => {
      // SKIP LOCKED để hai lần chạy song song không tranh cùng một bài. Chỉ
      // lấy PUBLISHED: bài RESERVED/DELIVERING đang có giao dịch sống.
      const due = await manager.query<
        { global_id: string; post_type: string }[]
      >(
        `
          SELECT global_id, post_type
          FROM posts
          WHERE status = 'PUBLISHED'
            AND deleted_at IS NULL
            AND expires_at IS NOT NULL
            AND expires_at <= $1
          ORDER BY expires_at ASC
          FOR UPDATE SKIP LOCKED
        `,
        [now],
      );

      if (due.length === 0) return { expired: 0, convertedToOffer: 0 };

      const toOffer = due
        .filter((row) => expiryConvertsToOffer(row.post_type as PostTypes))
        .map((row) => row.global_id);
      const toExpired = due
        .filter((row) => !expiryConvertsToOffer(row.post_type as PostTypes))
        .map((row) => row.global_id);

      if (toExpired.length > 0)
        await manager.query(
          `
            UPDATE posts
            SET status = 'EXPIRED', updated_at = now()
            WHERE global_id = ANY($1::uuid[]) AND status = 'PUBLISHED'
          `,
          [toExpired],
        );

      if (toOffer.length > 0)
        // Rao vặt hết hạn thì THÀNH bài Muốn Tặng, không biến mất (CHỐT-05).
        // Giá đã khai chuyển thành giá trị tham khảo; cờ thương lượng bỏ đi
        // vì món đồ không còn được bán nữa.
        await manager.query(
          `
            UPDATE posts
            SET post_type = 'OFFER',
                expires_at = $2::timestamptz + make_interval(months => $3),
                details = CASE
                  WHEN jsonb_exists(details, 'price')
                    THEN (details - 'price' - 'negotiable')
                         || jsonb_build_object('estimatedValue', details -> 'price')
                  ELSE details - 'negotiable'
                END,
                updated_at = now()
            WHERE global_id = ANY($1::uuid[]) AND status = 'PUBLISHED'
          `,
          [toOffer, now, PostLifetimeMonths],
        );

      return { expired: toExpired.length, convertedToOffer: toOffer.length };
    });
  }

  public async renewPost(params: IRenewPostParams): Promise<RenewPostOutcome> {
    return this.manager.transaction(async (manager) => {
      // Cùng khoá mà `createPostWithinQuota` dùng: gia hạn làm bài quay lại
      // rổ quota, nên hai đường ghi phải xếp hàng sau cùng một khoá.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        params.authorId,
      ]);

      const [post] = await manager.query<
        {
          status: string;
          post_type: string;
          renewed_count: number;
          remaining_quantity: number;
        }[]
      >(
        `
          SELECT status, post_type, renewed_count, remaining_quantity
          FROM posts
          WHERE global_id = $1 AND author_id = $2 AND deleted_at IS NULL
          FOR UPDATE
        `,
        [params.postId, params.authorId],
      );

      if (!post) return { status: 'NOT_FOUND' };

      // Rao vặt không gia hạn: nó tự chuyển thành Muốn Tặng khi hết hạn, nên
      // gia hạn sẽ kéo dài một trạng thái mà quy định đã định đoạt khác đi.
      if (
        expiryConvertsToOffer(post.post_type as PostTypes) ||
        (post.status !== 'PUBLISHED' && post.status !== 'EXPIRED') ||
        Number(post.remaining_quantity) <= 0
      )
        return { status: 'NOT_RENEWABLE' };

      if (Number(post.renewed_count) >= PostMaxRenewals)
        return { status: 'LIMIT_REACHED' };

      // Bài EXPIRED đang nằm ngoài rổ quota, gia hạn là đưa nó trở lại — nên
      // phải đếm lại. Bài PUBLISHED thì đã nằm trong rổ, loại chính nó ra để
      // không tự chặn mình.
      const [{ open_posts: openPosts }] = await manager.query<
        { open_posts: string }[]
      >(
        `
          SELECT COUNT(*) AS open_posts
          FROM posts
          WHERE author_id = $1
            AND deleted_at IS NULL
            AND global_id <> $2
            AND status::text = ANY($3::text[])
        `,
        [params.authorId, params.postId, QuotaStatuses],
      );

      if (Number(openPosts) >= params.quota)
        return { status: 'QUOTA_EXCEEDED' };

      // Cố ý KHÔNG dùng `RETURNING`: với UPDATE, `query()` của TypeORM trả
      // `[rows, affected]` chứ không phải `rows`, nên mọi phép đọc `.length`
      // hay `[0].cột` trên kết quả đều lặng lẽ sai. Hàng đã bị khoá và trạng
      // thái đã kiểm ở trên, nên đọc lại là đủ và không có cửa sổ tranh chấp.
      await manager.query(
        `
          UPDATE posts
          SET status = 'PUBLISHED',
              expires_at = $2,
              renewed_count = renewed_count + 1,
              updated_at = now()
          WHERE global_id = $1
        `,
        [params.postId, params.expiresAt],
      );

      const renewed = await manager.findOne(PostEntity, {
        where: { globalId: params.postId },
      });

      return renewed
        ? { status: 'RENEWED', post: renewed }
        : { status: 'NOT_FOUND' };
    });
  }

  public async requestCharityTransfer(
    params: IRequestCharityTransferParams,
  ): Promise<CharityTransferOutcome> {
    return this.manager.transaction(async (manager) => {
      const [post] = await manager.query<
        {
          status: string;
          remaining_quantity: number;
          charity_transfer_status: string | null;
        }[]
      >(
        `
          SELECT status, remaining_quantity, charity_transfer_status
          FROM posts
          WHERE global_id = $1 AND author_id = $2 AND deleted_at IS NULL
          FOR UPDATE
        `,
        [params.postId, params.authorId],
      );

      if (!post) return { status: 'NOT_FOUND' };

      // Đã có yêu cầu đang chờ thì không gửi tiếp — chủ bài bấm hai lần không
      // được biến thành hai việc cho Admin.
      const alreadyOpen =
        post.charity_transfer_status === CharityTransferStatuses.REQUESTED;
      const transferable =
        post.status === GiftPostStatuses.PUBLISHED ||
        post.status === GiftPostStatuses.EXPIRED;

      if (alreadyOpen || !transferable || Number(post.remaining_quantity) <= 0)
        return { status: 'INVALID_STATE' };

      await manager.query(
        `
          UPDATE posts
          SET charity_transfer_status = $2,
              charity_transfer_requested_at = now(),
              charity_transfer_note = $3,
              updated_at = now()
          WHERE global_id = $1
        `,
        [params.postId, CharityTransferStatuses.REQUESTED, params.note],
      );

      const updated = await manager.findOne(PostEntity, {
        where: { globalId: params.postId },
      });

      return updated
        ? { status: 'RECORDED', post: updated }
        : { status: 'NOT_FOUND' };
    });
  }

  public async reviewCharityTransfer(
    params: IReviewCharityTransferParams,
  ): Promise<CharityTransferOutcome> {
    return this.manager.transaction(async (manager) => {
      const [post] = await manager.query<
        { charity_transfer_status: string | null }[]
      >(
        `
          SELECT charity_transfer_status
          FROM posts
          WHERE global_id = $1 AND deleted_at IS NULL
          FOR UPDATE
        `,
        [params.postId],
      );

      if (!post) return { status: 'NOT_FOUND' };
      if (post.charity_transfer_status !== CharityTransferStatuses.REQUESTED)
        return { status: 'INVALID_STATE' };

      // Duyệt thì bài vào Kho Từ Thiện Chung; từ chối thì GIỮ NGUYÊN trạng
      // thái cũ — người dùng không mất bài vì Admin nói không.
      await manager.query(
        `
          UPDATE posts
          SET charity_transfer_status = $2,
              status = CASE WHEN $3::boolean THEN $4 ELSE status END,
              updated_at = now()
          WHERE global_id = $1
        `,
        [
          params.postId,
          params.approve
            ? CharityTransferStatuses.APPROVED
            : CharityTransferStatuses.REJECTED,
          params.approve,
          GiftPostStatuses.ARCHIVED,
        ],
      );

      const updated = await manager.findOne(PostEntity, {
        where: { globalId: params.postId },
      });

      return updated
        ? { status: 'RECORDED', post: updated }
        : { status: 'NOT_FOUND' };
    });
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
    currentUserId?: string,
  ): Promise<IPostEntity | null> {
    const qb = this.createQueryBuilder('post')
      .where('post.globalId = :globalId', { globalId })
      .andWhere('post.deletedAt IS NULL');

    if (currentUserId) {
      qb.andWhere(
        '(post.status IN (:...statuses) OR post.authorId = :currentUserId)',
        {
          statuses: [...PubliclyVisibleGiftPostStatuses],
          currentUserId,
        },
      );
    } else {
      qb.andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      });
    }

    return qb.getOne();
  }
}
