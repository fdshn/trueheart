import { PostInvalidStateException } from '@/domain/exceptions';
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
  IPostMapClusterResult,
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
import { lockEditablePost } from './lock-editable-post';

/**
 * Những trạng thái tính vào hạn mức đăng bài.
 *
 * Export vì `EntitlementRepository` phải báo "đã dùng bao nhiêu" theo ĐÚNG định
 * nghĩa mà chỗ này chặn. Hai bên lệch nhau thì API nói một đằng, lúc đăng bài
 * chặn một nẻo.
 */
/**
 * Trạng thái mà Admin còn can thiệp được.
 *
 * `RESERVED` nằm ngoài: gỡ ngang một lượt trao đang diễn ra để lại
 * hai người đã hẹn nhau mà bài thì biến mất. `COMPLETED`/`CANCELLED`/`EXPIRED`
 * cũng vậy — chúng đã đóng, và mở lại bằng nút kiểm duyệt là đi cửa sau vòng
 * đời bài. `PENDING_REVIEW` còn trong danh sách vì dữ liệu cũ từ thời còn duyệt
 * trước vẫn có thể sót lại.
 */
const ModeratableStatuses: readonly string[] = [
  'PUBLISHED',
  'REJECTED',
  'PENDING_REVIEW',
];

export const QuotaStatuses = [
  'PENDING_REVIEW',
  'PUBLISHED',
  'RESERVED',
  // Tên cũ của RESERVED, đã bị loại khỏi đường GHI ngày 29/09. Vẫn đếm: bỏ nó ra
  // nghĩa là một dòng sót sẽ KHÔNG ăn quota, tức tác giả được thêm một suất đăng
  // bài trong khi vẫn còn một nghĩa vụ chưa xong.
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

/**
 * Mệnh đề lọc bài theo danh mục VÀ toàn bộ nhánh con của nó.
 *
 * ## Vì sao không so bằng dấu bằng
 *
 * Trước 30/09 cả bốn đường đọc dùng `post.category_id = :categoryId` phẳng, nên lọc
 * theo một danh mục CHA trả về 0 bài — trong khi
 * [22 §22.1](../../../../../../docs/diagram/22-category.md) nói rõ *"truy vấn theo
 * nút cha phải lấy được cả nhánh con"*, và cùng đoạn đó còn nói bài đăng gắn vào nút
 * lá. Hai câu đó cộng lại nghĩa là chọn bất kỳ danh mục cha nào cũng ra feed rỗng.
 * Đo được: bài ở nút lá, lọc theo lá ra 1, lọc theo cha và gốc đều ra 0.
 *
 * ## Vì sao đệ quy TRONG câu, không giải id trước rồi truyền mảng
 *
 * Giải trước cần một lượt đi database nữa, và giữa hai lượt đó cây có thể đổi — lọc
 * ra một tập id không còn đúng với cây lúc đọc bài. Một câu thì không có khoảng hở
 * đó.
 *
 * `UNION` (không `ALL`) là hàng rào chống VÒNG: nó bỏ id đã thấy nên một vòng trong
 * cây làm câu dừng thay vì chạy mãi. Cần vì dữ liệu cũ có thể đã có vòng từ trước
 * khi `UpdateCategoryUseCase` biết chặn.
 */
function categorySubtreeFilter(placeholder: string): string {
  return `post.category_id IN (
    WITH RECURSIVE subtree AS (
      SELECT global_id FROM categories WHERE global_id = ${placeholder}
      UNION
      SELECT child.global_id
      FROM categories child
      INNER JOIN subtree ON child.parent_id = subtree.global_id
    )
    SELECT global_id FROM subtree
  )`;
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

  public async updateOwnedContent(params: {
    postId: string;
    authorId: string;
    expectedUpdatedAt: Date;
    changes: Partial<IPostEntity>;
  }): Promise<IPostEntity> {
    return this.manager.transaction(async (manager) => {
      const current = await lockEditablePost(
        manager,
        params.postId,
        params.authorId,
      );
      // Validation used a snapshot. Never merge that stale snapshot over a
      // concurrent edit, allocation, moderation or lifecycle transition.
      if (current.updatedAt.getTime() !== params.expectedUpdatedAt.getTime())
        throw new PostInvalidStateException();
      await manager.save(PostEntity, { ...current, ...params.changes });
      const updated = await manager.findOneByOrFail(PostEntity, {
        globalId: params.postId,
      });
      const content = (post: IPostEntity) => ({
        title: post.title,
        description: post.description,
        categoryId: post.categoryId,
        areaLabel: post.areaLabel,
        location: post.location,
        details: post.details,
        totalQuantity: post.totalQuantity,
        remainingQuantity: post.remainingQuantity,
        isSos: post.isSos,
        deliveryMethod: post.deliveryMethod,
        shipPayer: post.shipPayer,
      });
      await manager.query(
        `INSERT INTO admin_audit_logs
         (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'OWNER_UPDATE_POST', 'POST', $2, $3::jsonb, $4::jsonb, $5)`,
        [
          params.authorId,
          params.postId,
          JSON.stringify(content(current)),
          JSON.stringify(content(updated)),
          'Owner edited post content',
        ],
      );
      // Do not touch REQUESTED records or queue timestamps. Notification for
      // waiting applicants is tracked in documentation/post-edit-notifications.md.
      return updated;
    });
  }

  public async findNearbyPosts(
    params: IFindNearbyPostsParams,
  ): Promise<IFindNearbyPostsResult> {
    const baseQuery = this.createQueryBuilder('post')
      .where('post.deletedAt IS NULL')
      .andWhere('post.status IN (:...statuses)', {
        statuses: [...PubliclyVisibleGiftPostStatuses],
      });

    // Bỏ trống loại bài là CỐ Ý: feed trộn cả năm loại. Bắt buộc chọn loại thì
    // client muốn một feed trộn phải gọi năm lần rồi tự ghép, mà mỗi lần phân
    // trang riêng nên ghép xong thứ tự vô nghĩa.
    if (params.postType)
      baseQuery.andWhere('post.postType = :postType', {
        postType: params.postType,
      });

    if (params.categoryId)
      baseQuery.andWhere(categorySubtreeFilter(':categoryId'), {
        categoryId: params.categoryId,
      });

    // Chỉ lọc khi được yêu cầu rõ ràng. `is_sos` có `default false` và NOT NULL
    // nên không cần phòng `IS NULL`.
    if (params.isSos) baseQuery.andWhere('post.isSos = true');

    // Tìm theo từ khoá, KHÔNG phân biệt dấu. Biểu thức phải trùng khít với
    // biểu thức của index GIN (`IDX_posts_search`), sai một ký tự là Postgres
    // bỏ index và quét tuần tự cả bảng.
    //
    // `plainto_tsquery` chứ không `to_tsquery`: người dùng gõ tự do, và
    // `to_tsquery` ném lỗi cú pháp ngay khi gặp một dấu `&` hay dấu nháy.
    if (params.keyword)
      baseQuery.andWhere(
        `to_tsvector('simple', chantam_unaccent(coalesce(post.title, '') || ' ' || coalesce(post.description, '')))
         @@ plainto_tsquery('simple', chantam_unaccent(:keyword))`,
        { keyword: params.keyword },
      );

    // Không có gốc toạ độ thì KHÔNG lọc bán kính. Bán kính quanh một tâm không
    // tồn tại là lọc quanh một điểm người dùng không chọn.
    const origin = params.origin;
    if (origin && params.radiusMeters !== undefined)
      GeoQueryHelper.applyRadiusFilter(baseQuery, 'post', {
        ...origin,
        radiusMeters: params.radiusMeters,
      });

    const total = await baseQuery.getCount();
    if (total === 0) return { items: [], total };

    const listQuery = baseQuery.clone();

    if (origin) {
      GeoQueryHelper.selectDistance(
        listQuery,
        'post',
        origin,
        'distance_meters',
      );
      GeoQueryHelper.orderByDistance(listQuery, 'post', origin);
    } else {
      // Không có khoảng cách để xếp thì xếp theo thời gian — feed không có thứ
      // tự nào là feed xáo lại sau mỗi lần gọi.
      listQuery.orderBy('post.createdAt', 'DESC');
    }

    // Chốt thứ tự bằng khoá chính. Thiếu nó thì hai bài cùng khoảng cách (cùng
    // toà nhà, cùng địa chỉ) — hoặc cùng mốc thời gian tạo — không có thứ tự
    // đảm bảo giữa hai lần chạy, và lật trang bằng OFFSET sẽ lặp bài hoặc bỏ
    // sót bài.
    listQuery.addOrderBy('post.id', 'ASC');
    listQuery.offset(params.skip).limit(params.take);

    const { entities, raw } =
      await listQuery.getRawAndEntities<Record<string, unknown>>();

    return {
      items: entities.map((post, index) => ({
        post,
        // `null` chứ không `0`: không có gốc thì không có khoảng cách, và `0`
        // đọc ra là "cách bạn 0 mét".
        distanceMeters: origin
          ? Number(raw[index]?.distance_meters ?? 0)
          : null,
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
      query.andWhere(categorySubtreeFilter(':categoryId'), {
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
    // Lọc theo cả nhánh con, không so bằng dấu bằng — xem `categorySubtreeFilter`.
    if (params.categoryId) {
      values.push(params.categoryId);
      conditions.push(categorySubtreeFilter(`$${values.length}`));
    }
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

  public async moderateByAdmin(
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
      if (!current || !ModeratableStatuses.includes(current.status))
        return null;
      // Gọi lại đúng quyết định cũ thì không ghi thêm một dòng audit nói rằng
      // có gì đó vừa đổi.
      if (current.status === command.status) return null;

      await manager.query(
        `
          UPDATE posts
          SET status = $2,
              -- Chỉ đặt hạn khi bài CHƯA có. Trả lại bài gỡ nhầm mà đặt lại
              -- đồng hồ là thưởng thêm ba tháng cho một bài đã sống gần hết.
              -- Lúc gỡ thì $3 là NULL, nên COALESCE giữ nguyên hạn cũ.
              expires_at = COALESCE(expires_at, $3::timestamptz),
              updated_at = now()
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

  public async findMapClusters(
    params: IFindPostMapMarkersParams,
  ): Promise<IPostMapClusterResult> {
    const values: unknown[] = [
      params.minLng,
      params.minLat,
      params.maxLng,
      params.maxLat,
      params.stepDegrees,
    ];
    const conditions: string[] = [
      'post.deleted_at IS NULL',
      `post.status IN (${PubliclyVisibleGiftPostStatuses.map(
        (status) => `'${status}'`,
      ).join(', ')})`,
      'ST_Intersects(post.location::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))',
    ];

    if (params.postType) {
      values.push(params.postType);
      conditions.push(`post.post_type = $${values.length}`);
    }
    if (params.categoryId) {
      values.push(params.categoryId);
      // Cả nhánh con — xem `categorySubtreeFilter`.
      conditions.push(categorySubtreeFilter(`$${values.length}`));
    }

    const originSelect = params.origin
      ? (() => {
          values.push(params.origin.lng, params.origin.lat);

          return `ST_Distance(sole.location, ST_SetSRID(ST_MakePoint($${
            values.length - 1
          }, $${values.length}), 4326)::geography)`;
        })()
      : 'NULL::double precision';

    values.push(params.cellLimit);
    const limitParam = `$${values.length}`;

    // `ST_SnapToGrid` cho ra GÓC DƯỚI-TRÁI của ô, và lưới neo vào gốc toạ độ
    // chứ không vào khung nhìn — nhờ vậy kéo bản đồ ngang thì cụm đứng yên.
    //
    // `count(*) OVER ()` và `sum(...) OVER ()` chạy TRƯỚC `LIMIT`, nên hai con
    // số tổng là số thật của cả khung nhìn chứ không phải của phần đã cắt. Đây
    // đúng là thứ mà bản cũ thiếu: nó cắt ở 200 marker và không nói gì.
    const rows = await this.manager.query<
      {
        cell_lng: string;
        cell_lat: string;
        total: string;
        cell_count: string;
        viewport_total: string;
        global_id: string | null;
        post_type: PostTypes | null;
        category_id: string | null;
        area_label: string | null;
        title: string | null;
        is_sos: boolean | null;
        thumbnail_key: string | null;
        lat: string | null;
        lng: string | null;
        distance_meters: string | null;
      }[]
    >(
      `
        WITH bounded AS (
          SELECT post.global_id, post.location, post.location::geometry AS geom
          FROM posts post
          WHERE ${conditions.join(' AND ')}
        ),
        clustered AS (
          SELECT ST_SnapToGrid(geom, $5, $5) AS cell,
                 count(*)::int AS total,
                 -- Postgres KHÔNG có aggregate min() cho uuid; lấy phần tử đầu
                 -- của mảng đã sắp cho ra cùng kết quả và chạy được với mọi kiểu.
                 (array_agg(global_id ORDER BY global_id))[1] AS sole_id,
                 count(*) OVER ()::int AS cell_count,
                 sum(count(*)) OVER ()::int AS viewport_total
          FROM bounded
          GROUP BY 1
        )
        SELECT ST_X(clustered.cell) AS cell_lng,
               ST_Y(clustered.cell) AS cell_lat,
               clustered.total,
               clustered.cell_count,
               clustered.viewport_total,
               sole.global_id, sole.post_type, sole.category_id,
               sole.area_label, sole.title, sole.is_sos,
               ST_Y(sole.location::geometry) AS lat,
               ST_X(sole.location::geometry) AS lng,
               ${originSelect} AS distance_meters,
               (SELECT m.r2_key FROM post_media m
                 WHERE m.post_id = sole.global_id
                 ORDER BY m.sort_order ASC, m.id ASC
                 LIMIT 1) AS thumbnail_key
        FROM clustered
        -- Chỉ nạp chi tiết cho ô có ĐÚNG MỘT bài. Ô đông thì client chỉ cần
        -- con số, và nạp chi tiết ở đó là kéo về đúng thứ vừa quyết không trả.
        LEFT JOIN LATERAL (
          SELECT * FROM posts detail
          WHERE clustered.total = 1 AND detail.global_id = clustered.sole_id
        ) sole ON true
        ORDER BY clustered.total DESC, cell_lng ASC, cell_lat ASC
        LIMIT ${limitParam}
      `,
      values,
    );

    return {
      clusters: rows.map((row) => ({
        cellLng: Number(row.cell_lng),
        cellLat: Number(row.cell_lat),
        count: Number(row.total),
        marker:
          row.global_id === null
            ? null
            : {
                globalId: row.global_id,
                postType: row.post_type as PostTypes,
                categoryId: row.category_id as string,
                areaLabel: row.area_label as string,
                title: row.title as string,
                isSos: Boolean(row.is_sos),
                thumbnailKey: row.thumbnail_key,
                location: { lat: Number(row.lat), lng: Number(row.lng) },
                ...(row.distance_meters === null
                  ? {}
                  : { distanceMeters: Number(row.distance_meters) }),
              },
      })),
      total: Number(rows[0]?.viewport_total ?? 0),
      cellCount: Number(rows[0]?.cell_count ?? 0),
    };
  }

  public async findPostsExpiringSoon(params: {
    withinDays: number;
    limit: number;
  }): Promise<
    {
      postId: string;
      authorId: string;
      title: string;
      expiresAt: Date;
      daysLeft: number;
    }[]
  > {
    const rows = await this.manager.query<
      {
        global_id: string;
        author_id: string;
        title: string;
        expires_at: Date;
        days_left: string;
      }[]
    >(
      `
        SELECT global_id, author_id, title, expires_at,
               CEIL(EXTRACT(EPOCH FROM (expires_at - now())) / 86400)::text
                 AS days_left
        FROM posts
        WHERE status = 'PUBLISHED'
          AND deleted_at IS NULL
          AND expires_at IS NOT NULL
          -- Chưa hết hạn: bài đã quá hạn thì post:expire lo, nhắc gia hạn lúc
          -- đó là mời người ta bấm một nút sắp hết tác dụng.
          AND expires_at > now()
          AND expires_at <= now() + ($1 || ' days')::interval
        ORDER BY expires_at ASC
        LIMIT $2
      `,
      [String(params.withinDays), params.limit],
    );

    return rows.map((row) => ({
      postId: row.global_id,
      authorId: row.author_id,
      title: row.title,
      expiresAt: row.expires_at,
      daysLeft: Number(row.days_left),
    }));
  }

  public async expireDuePosts(now: Date): Promise<IExpireDuePostsResult> {
    return this.manager.transaction(async (manager) => {
      // SKIP LOCKED để hai lần chạy song song không tranh cùng một bài. Chỉ
      // lấy PUBLISHED: bài RESERVED đang có giao dịch sống.
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

      if (due.length === 0)
        return { expired: 0, convertedToOffer: 0, expiredPostIds: [] };

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

      return {
        expired: toExpired.length,
        convertedToOffer: toOffer.length,
        expiredPostIds: toExpired,
      };
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
