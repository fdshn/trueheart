import { IAppendPointEntryResult } from '@/application/contracts/point';
import {
  ClassifiedTransactionNotSupportedException,
  GiftRequestInvalidQuantityException,
  GiftRequestNotFoundException,
  GiftTransactionInvalidStateException,
  GiftTransactionOutOfStockException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  ICandidateMetricsWithId,
  IChatRepository,
  IClosedRequestRow,
  IGiftRequestDetail,
  IGiftRequestRepository,
  IMyGiftRequestRow,
  IPointLedgerRepository,
  IRecipientSelectionAudit,
  IRedemptionContext,
  IStandbyNudgeRow,
} from '@/domain/ports/repository';
import { GiftRequestEntity, UserEntity } from '@/infrastructure/entity';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  GiftRequestStatusReasons,
  PostTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IPostRequesterPreviewDto,
  IPostRequestItemDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { giftTransactionRoles } from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, EntitySchema, Repository } from 'typeorm';
import {
  IRebalancedRequest,
  rebalanceOpenRequests,
} from './gift-request-rebalance';
import { updateReturning } from './update-returning';

/**
 * Bài ở những trạng thái này thì mọi yêu cầu treo dưới nó đã hết ý nghĩa.
 *
 * `RESERVED` KHÔNG nằm đây: lượt trao đang chạy, và người đứng
 * `STANDBY` vẫn được xét tiếp nếu nó đổ.
 */
const ClosedPostStatuses: readonly string[] = [
  GiftPostStatuses.EXPIRED,
  GiftPostStatuses.CANCELLED,
  GiftPostStatuses.REJECTED,
  GiftPostStatuses.COMPLETED,
  GiftPostStatuses.ARCHIVED,
  // Rao vặt đã bán là điểm cuối (PR #46 §8).
  GiftPostStatuses.SOLD,
];

/**
 * Người xin còn được hệ thống tự chọn (PR #46 §9): tài khoản chưa xoá, không bị khoá, và
 * không đang trong hạn treo. Hạn treo xét LÚC DÙNG như đăng nhập (`suspended_until <= now()`
 * là đã hết hạn) — không có job nào lật `SUSPENDED` về `ACTIVE`.
 *
 * Dùng cho CẢ câu quét bài tới hạn lẫn câu đọc ứng viên: lệch nhau thì một bài chỉ còn ứng
 * viên bị khoá sẽ được quét mãi mà không bao giờ chọn được ai.
 */
const eligibleRequesterSql = (alias: string) => `(
  ${alias}.deleted_at IS NULL
  AND (${alias}.status = 'ACTIVE'
       OR (${alias}.status = 'SUSPENDED' AND ${alias}.suspended_until <= now()))
)`;

interface IMyRequestRow {
  global_id: string;
  post_id: string;
  requester_id: string;
  message: string;
  status: GiftRequestStatuses;
  queue_joined_at: Date;
  withdrawn_at: Date | null;
  offering_post_id: string | null;
  requested_quantity: number | string;
  status_reason: GiftRequestStatusReasons | null;
  created_at: Date;
  updated_at: Date;
  post_title: string;
  post_status: GiftPostStatuses;
  post_thumbnail_key: string | null;
  total: string;
}

@Injectable()
export class GiftRequestRepository
  extends Repository<IGiftRequestEntity>
  implements IGiftRequestRepository
{
  public constructor(
    @Inject(IGiftRequestEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
    // Repository gọi repository trong cùng tầng hạ tầng là chấp nhận được, và
    // là cách duy nhất giữ "mở chat" nằm trong transaction của "duyệt" —
    // transaction đó được mở ở đây, không ở use case.
    @Inject(IChatRepository)
    private readonly chat: IChatRepository,
    // Repository gọi repository trong cùng tầng hạ tầng — cùng lối với chat ở
    // trên, và là cách duy nhất giữ khoản trừ điểm NẰM TRONG transaction của lượt
    // duyệt (SRS CHỐT-13). Transaction đó được mở ở đây, không ở use case.
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {
    super(target, manager);
  }

  /**
   * Request MỚI NHẤT của một người trên một bài. Mỗi lần gửi lại là một dòng mới (1803300000000),
   * nên "request của tôi" luôn phải chỉ rõ là cái mới nhất — `findOne` không thứ tự trả một dòng
   * bất kỳ trong lịch sử.
   */
  public async findByPostAndRequester(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null> {
    return this.findOne({
      where: { postId, requesterId } as never,
      order: { createdAt: 'DESC', id: 'DESC' } as never,
    });
  }

  public async hasLiveTransactionOnPost(
    postId: string,
    requesterId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ live: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM gift_transactions deal
           JOIN posts post ON post.global_id = deal.post_id
          WHERE deal.post_id = $1
            AND deal.status IN ('ACCEPTED', 'DELIVERING')
            -- Người xin là bên không phải tác giả: người nhận ở bài Muốn Tặng,
            -- người tặng ở bài Muốn Nhận.
            AND CASE WHEN deal.giver_id = post.author_id
                     THEN deal.receiver_id ELSE deal.giver_id END = $2
       ) AS live`,
      [postId, requesterId],
    );
    return Boolean(row?.live);
  }

  /** Mọi request của một người trên một bài, mới nhất trước — lịch sử cho màn chi tiết. */
  public async listByPostAndRequester(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity[]> {
    return this.find({
      where: { postId, requesterId } as never,
      order: { createdAt: 'DESC', id: 'DESC' } as never,
    });
  }

  /**
   * Chủ bài sửa tổng số lượng → số còn lại đổi → cân lại hàng chờ (thêm hàng thì người đang
   * STANDBY vừa đủ được về PENDING; bớt hàng thì người xin quá số còn lại chuyển STANDBY).
   */
  public async rebalanceOpenRequests(
    postId: string,
  ): Promise<IRebalancedRequest[]> {
    return this.manager.transaction(async (manager) => {
      // Cùng thứ tự khoá với đường duyệt: request trước, bài sau.
      await manager.query(
        `SELECT global_id FROM gift_requests
          WHERE post_id = $1 AND status IN ('PENDING', 'STANDBY') AND deleted_at IS NULL
          ORDER BY global_id FOR UPDATE`,
        [postId],
      );
      await manager.query(
        `SELECT global_id FROM posts WHERE global_id = $1 FOR UPDATE`,
        [postId],
      );
      return rebalanceOpenRequests(manager, postId);
    });
  }

  /**
   * Người xin GIẢM số lượng của request đang chờ. Không cho tăng: tăng là một cam kết khác — rút
   * rồi gửi lại. Request STANDBY mà số mới vừa số còn lại thì về PENDING, giữ chỗ trong hàng.
   */
  public async updateRequestedQuantity(params: {
    postId: string;
    requesterId: string;
    requestedQuantity: number;
  }): Promise<IGiftRequestEntity> {
    return this.manager.transaction(async (manager) => {
      const [open] = await manager.query<
        { global_id: string; requested_quantity: number | string }[]
      >(
        `SELECT global_id, requested_quantity FROM gift_requests
          WHERE post_id = $1 AND requester_id = $2
            AND status IN ('PENDING', 'STANDBY') AND deleted_at IS NULL
          FOR UPDATE`,
        [params.postId, params.requesterId],
      );
      if (!open) throw new GiftRequestNotFoundException(params.postId);
      if (params.requestedQuantity >= Number(open.requested_quantity))
        throw new GiftRequestInvalidQuantityException(
          'chỉ được giảm số lượng — muốn xin nhiều hơn thì rút và gửi lại',
        );
      await manager.query(
        `SELECT global_id FROM posts WHERE global_id = $1 FOR UPDATE`,
        [params.postId],
      );
      await manager.query(
        `UPDATE gift_requests SET requested_quantity = $2, updated_at = now()
          WHERE global_id = $1`,
        [open.global_id, params.requestedQuantity],
      );
      await rebalanceOpenRequests(manager, params.postId);
      const updated = await manager.findOne(GiftRequestEntity, {
        where: { globalId: open.global_id } as never,
      });
      return updated as IGiftRequestEntity;
    });
  }

  /**
   * Rút yêu cầu bằng MỘT câu có điều kiện trên trạng thái.
   *
   * Đọc-rồi-ghi ở đây đè mất một lượt duyệt vừa commit xen vào giữa: bên rút
   * đọc thấy PENDING, bên duyệt commit (trừ tồn kho, tạo giao dịch), rồi câu
   * ghi của bên rút đáp xuống và biến yêu cầu ACCEPTED thành WITHDRAWN. Để
   * database tự quyết bằng mệnh đề WHERE thì cửa sổ đó biến mất.
   */
  public async withdrawIfPending(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null> {
    // Phải đi qua `updateReturning`: `query()` bọc kết quả UPDATE thành
    // `[rows, affected]`. Đọc thẳng `.length` hay `[0].cột` ở đây từng cho ra
    // `length` luôn bằng 2 nên nhánh "không còn PENDING" không bao giờ chạy,
    // và `rows[0].global_id` là `undefined` nên `findOne` bỏ qua điều kiện rồi
    // trả về một yêu cầu BẤT KỲ — tức là yêu cầu của người khác.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE gift_requests
       SET status = $1, withdrawn_at = now(), status_reason = NULL,
           updated_at = now()
       WHERE post_id = $2 AND requester_id = $3
         AND status::text = ANY($4::text[]) AND deleted_at IS NULL
       RETURNING global_id`,
      [
        GiftRequestStatuses.WITHDRAWN,
        postId,
        requesterId,
        // Rút được cả khi đang STANDBY: người trong hàng đợi phải có đường ra.
        // Chỉ cho rút lúc PENDING nghĩa là hết hàng một lần là họ bị giữ trong
        // hàng đợi cho tới khi bài đóng.
        [GiftRequestStatuses.PENDING, GiftRequestStatuses.STANDBY],
      ],
    );

    if (rows.length === 0) return null;

    return this.findOne({ where: { globalId: rows[0].global_id } as never });
  }

  public async countActiveByPostIds(
    postIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (postIds.length === 0) return map;

    const raw = await this.createQueryBuilder('gr')
      .select('gr.post_id', 'postId')
      // Đếm NGƯỜI, không đếm dòng: một người có request đã nhận xong (ACCEPTED) và một
      // request mới đang chờ là hai dòng nhưng vẫn là một người quan tâm.
      .addSelect('COUNT(DISTINCT gr.requester_id)', 'cnt')
      .where('gr.post_id IN (:...postIds)', { postIds })
      .andWhere('gr.deleted_at IS NULL')
      // REJECTED không còn hoạt động: đó là lúc người cho chủ động từ chối.
      //
      // STANDBY thì VẪN đếm: người đó còn trong hàng đợi và được xét tiếp nếu
      // lượt trao hiện tại bị huỷ (F33). Loại họ khỏi `requestCount` là nói với
      // người xem rằng bài hết người quan tâm, trong khi hàng đợi còn nguyên.
      .andWhere('gr.status NOT IN (:...inactive)', {
        inactive: [
          GiftRequestStatuses.WITHDRAWN,
          GiftRequestStatuses.CANCELLED,
          GiftRequestStatuses.REJECTED,
        ],
      })
      .groupBy('gr.post_id')
      .getRawMany();

    for (const row of raw) {
      map.set(row.postId, Number(row.cnt));
    }
    return map;
  }

  public async listRecentRequestersByPostIds(
    postIds: string[],
    limitPerPost: number,
  ): Promise<Map<string, IPostRequesterPreviewDto[]>> {
    const map = new Map<string, IPostRequesterPreviewDto[]>();
    if (postIds.length === 0) return map;

    // CÙNG bộ lọc trạng thái với `countActiveByPostIds` — lệch nhau là dải avatar hiện người
    // mà con số không đếm, hoặc ngược lại. Một người chỉ có một yêu cầu đang mở trên một bài,
    // nên không cần khử trùng theo người.
    const rows = await this.manager.query<
      {
        post_id: string;
        username: string;
        avatar_url: string | null;
      }[]
    >(
      `
        SELECT ranked.post_id, ranked.username, ranked.avatar_url
          FROM (
            SELECT latest.post_id, person.username, person.avatar_url,
                   row_number() OVER (
                     PARTITION BY latest.post_id
                     ORDER BY latest.created_at DESC, latest.id DESC
                   ) AS position
              FROM (
                -- Một người một ô: request còn hoạt động MỚI NHẤT của họ trên bài.
                SELECT DISTINCT ON (request.post_id, request.requester_id)
                       request.post_id, request.requester_id,
                       request.created_at, request.id
                  FROM gift_requests request
                 WHERE request.post_id = ANY($1::uuid[])
                   AND request.deleted_at IS NULL
                   AND request.status <> ALL($2::gift_requests_status_enum[])
                 ORDER BY request.post_id, request.requester_id,
                          request.created_at DESC, request.id DESC
              ) latest
              JOIN users person ON person.global_id = latest.requester_id
          ) ranked
         WHERE ranked.position <= $3
         ORDER BY ranked.post_id, ranked.position
      `,
      [
        postIds,
        [
          GiftRequestStatuses.WITHDRAWN,
          GiftRequestStatuses.CANCELLED,
          GiftRequestStatuses.REJECTED,
        ],
        limitPerPost,
      ],
    );

    for (const row of rows) {
      const list = map.get(row.post_id) ?? [];
      list.push({
        username: row.username,
        avatarUrl: row.avatar_url,
      });
      map.set(row.post_id, list);
    }
    return map;
  }

  public async findStatusesByPostIdsAndRequester(
    postIds: string[],
    requesterId: string,
  ): Promise<Map<string, GiftRequestStatuses>> {
    const map = new Map<string, GiftRequestStatuses>();
    if (postIds.length === 0 || !requesterId) return map;

    // Request MỚI NHẤT mỗi bài. Lặp qua mọi dòng rồi `map.set` là để dòng nào đến sau thắng —
    // không có thứ tự thì trạng thái hiển thị có thể là của một lần gửi cũ.
    const rows = await this.manager.query<
      { post_id: string; status: GiftRequestStatuses }[]
    >(
      `SELECT DISTINCT ON (post_id) post_id, status
         FROM gift_requests
        WHERE post_id = ANY($1::uuid[]) AND requester_id = $2 AND deleted_at IS NULL
        ORDER BY post_id, created_at DESC, id DESC`,
      [postIds, requesterId],
    );
    for (const row of rows) map.set(row.post_id, row.status);
    return map;
  }

  public async listByPostId(
    postId: string,
    skip: number,
    take: number,
  ): Promise<{ items: IPostRequestItemDto[]; total: number }> {
    const total = await this.manager
      .createQueryBuilder(GiftRequestEntity, 'gr')
      .where('gr.post_id = :postId', { postId })
      .andWhere('gr.deleted_at IS NULL')
      .getCount();

    const rawRows = await this.manager
      .createQueryBuilder(GiftRequestEntity, 'gr')
      .leftJoin(UserEntity, 'u', 'u.global_id = gr.requester_id')
      .select('gr.global_id', 'id')
      .addSelect('gr.post_id', 'postId')
      .addSelect('gr.requester_id', 'requesterId')
      .addSelect('gr.message', 'message')
      .addSelect('gr.status', 'status')
      .addSelect('gr.queue_joined_at', 'queueJoinedAt')
      .addSelect('gr.created_at', 'createdAt')
      .addSelect('gr.requested_quantity', 'requestedQuantity')
      .addSelect('gr.status_reason', 'statusReason')
      .addSelect('u.global_id', 'user_id')
      .addSelect('u.username', 'user_username')
      .addSelect('u.full_name', 'user_full_name')
      .addSelect('u.avatar_url', 'user_avatar_url')
      .addSelect('u.rank', 'user_rank')
      .where('gr.post_id = :postId', { postId })
      .andWhere('gr.deleted_at IS NULL')
      .orderBy('gr.queue_joined_at', 'ASC')
      .offset(skip)
      .limit(take)
      .getRawMany();

    const items = rawRows.map((row) => ({
      id: row.id,
      postId: row.postId,
      requesterId: row.requesterId,
      message: row.message,
      status: row.status,
      queueJoinedAt: new Date(row.queueJoinedAt),
      createdAt: new Date(row.createdAt),
      requestedQuantity: Number(row.requestedQuantity ?? 1),
      statusReason: row.statusReason ?? null,
      requester: row.user_id
        ? {
            userId: row.user_id,
            username: row.user_username,
            fullName: row.user_full_name,
            avatarUrl: row.user_avatar_url,
            rank: row.user_rank,
          }
        : undefined,
    }));

    return { items, total };
  }

  /**
   * Duyệt một yêu cầu xin nhận.
   *
   * THỨ TỰ KHOÁ là `gift_requests` → `gift_transactions` → `posts`, và phải
   * giữ nguyên. `GiftTransactionRepository` khoá `gift_transactions` rồi mới
   * `UPDATE posts`; nếu ở đây khoá `posts` trước thì hai luồng duyệt khác nhau
   * chạy đồng thời trên cùng một bài tạo thành chờ vòng tròn.
   *
   * Quan trọng không kém: khoá TẤT CẢ yêu cầu PENDING của bài ngay từ đầu, theo
   * `ORDER BY global_id`. Khoá mỗi hàng của chính mình là chưa đủ — cuối hàm có
   * câu từ chối hàng loạt đụng vào các hàng KHÁC, nên hai người tặng bấm duyệt
   * cùng lúc sẽ thành: A giữ reqA và `posts`, chờ reqB; B giữ reqB, chờ `posts`.
   * Lấy trọn bộ theo một thứ tự cố định thì người thứ hai chỉ việc xếp hàng.
   *
   * Đã đo bằng `npm run test:concurrency`: chỉ khoá một hàng thì 24/25 vòng dính
   * `40P01`.
   */
  public async countOpenByRequester(requesterId: string): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      // JOIN sang `posts` là lưới an toàn, không phải phép lọc chính. Đường
      // đóng yêu cầu (`closeOpenForPosts`) mới là chỗ sửa cho đúng; nhưng nếu
      // mai này có thêm một đường đóng bài mà quên gọi nó, thì tệ nhất là con
      // số hiển thị hơi lệch — chứ không phải một người bị khoá VĨNH VIỄN,
      // không xin được gì nữa, mà không có cách nào hiểu vì sao.
      //
      // RESERVED VẪN tính: người đứng STANDBY dưới một lượt trao
      // đang chạy là hàng đợi còn sống, họ được xét tiếp nếu lượt đó đổ.
      `SELECT COUNT(*) AS total
       FROM gift_requests request
       INNER JOIN posts post ON post.global_id = request.post_id
       WHERE request.requester_id = $1
         AND request.status IN ($2, $3)
         AND request.deleted_at IS NULL
         AND post.deleted_at IS NULL
         AND post.status::text <> ALL($4::text[])`,
      [
        requesterId,
        GiftRequestStatuses.PENDING,
        GiftRequestStatuses.STANDBY,
        ClosedPostStatuses,
      ],
    );

    return Number(row?.total ?? 0);
  }

  public async listByRequester(params: {
    requesterId: string;
    status?: GiftRequestStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IMyGiftRequestRow[]; total: number }> {
    const values: unknown[] = [params.requesterId];
    let statusCondition = '';
    if (params.status) {
      values.push(params.status);
      statusCondition = `AND request.status = $${values.length}`;
    }
    values.push(params.take, params.skip);

    const rows = await this.manager.query<IMyRequestRow[]>(
      `
        SELECT request.global_id, request.post_id, request.requester_id,
               request.message, request.status, request.queue_joined_at,
               request.withdrawn_at, request.offering_post_id,
               request.requested_quantity, request.status_reason,
               request.created_at, request.updated_at,
               post.title AS post_title, post.status AS post_status,
               media.r2_key AS post_thumbnail_key,
               COUNT(*) OVER () AS total
        FROM gift_requests request
        INNER JOIN posts post ON post.global_id = request.post_id
        -- Ảnh đầu tiên thôi: đây là danh sách, không phải màn chi tiết.
        LEFT JOIN LATERAL (
          SELECT r2_key FROM post_media
          WHERE post_id = post.global_id
          ORDER BY sort_order ASC
          LIMIT 1
        ) media ON true
        WHERE request.requester_id = $1
          AND request.deleted_at IS NULL
          ${statusCondition}
        -- Mới nhất trước: người dùng mở màn này để xem việc vừa làm ra sao.
        ORDER BY request.created_at DESC, request.id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );

    return {
      items: rows.map((row) => ({
        request: {
          globalId: row.global_id,
          postId: row.post_id,
          requesterId: row.requester_id,
          message: row.message,
          status: row.status,
          queueJoinedAt: row.queue_joined_at,
          withdrawnAt: row.withdrawn_at,
          offeringPostId: row.offering_post_id,
          requestedQuantity: Number(row.requested_quantity),
          statusReason: row.status_reason,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } as IGiftRequestEntity,
        postTitle: row.post_title,
        postStatus: row.post_status,
        postThumbnailKey: row.post_thumbnail_key,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  public async findDetail(
    requestId: string,
  ): Promise<IGiftRequestDetail | null> {
    const [row] = await this.manager.query<
      {
        global_id: string;
        post_id: string;
        owner_id: string;
        requester_id: string;
        status: GiftRequestStatuses;
        message: string | null;
        created_at: Date;
        transaction_id: string | null;
      }[]
    >(
      `SELECT request.global_id, request.post_id, post.author_id AS owner_id,
              request.requester_id, request.status, request.message,
              request.created_at,
              -- Lượt trao ghi request_id từ 1803300000000. Dữ liệu cũ không nối được
              -- thì lùi về cặp (bài, ĐỐI PHƯƠNG) — chỉ cho lượt chưa gắn request nào,
              -- để request mới không nhặt nhầm lượt của lần gửi trước.
              COALESCE(
                (SELECT deal.global_id FROM gift_transactions deal
                  WHERE deal.request_id = request.global_id
                  ORDER BY deal.requested_at DESC, deal.id DESC
                  LIMIT 1),
                (SELECT deal.global_id FROM gift_transactions deal
                  WHERE deal.request_id IS NULL
                    AND deal.post_id = request.post_id
                    AND (deal.receiver_id = request.requester_id
                         OR deal.giver_id = request.requester_id)
                  ORDER BY deal.requested_at DESC, deal.id DESC
                  LIMIT 1)
              ) AS transaction_id
         FROM gift_requests request
         INNER JOIN posts post ON post.global_id = request.post_id
        WHERE request.global_id = $1
          AND request.deleted_at IS NULL`,
      [requestId],
    );
    return row
      ? {
          requestId: row.global_id,
          postId: row.post_id,
          ownerId: row.owner_id,
          requesterId: row.requester_id,
          status: row.status,
          message: row.message,
          createdAt: row.created_at,
          transactionId: row.transaction_id,
        }
      : null;
  }

  public async closeOpenForPosts(params: {
    postIds: string[];
    status: GiftRequestStatuses;
    /** Mã lý do ghi kèm (vd `POST_COMPLETED`). */
    statusReason?: GiftRequestStatusReasons | null;
    /** Chỉ đóng khi bài ĐANG ở trạng thái này — vd chỉ khi bài đã `COMPLETED`. */
    onlyIfPostStatus?: GiftPostStatuses;
  }): Promise<IClosedRequestRow[]> {
    if (params.postIds.length === 0) return [];

    // Tiêu đề bài lấy trong CÙNG câu lệnh: đọc lại sau khi đóng thì bài gỡ mềm
    // có thể đã biến mất khỏi mọi truy vấn thường, và thông báo gửi đi sẽ nhắc
    // tới một bài không tên.
    const rows = await updateReturning<{
      global_id: string;
      requester_id: string;
      post_id: string;
      post_title: string;
    }>(
      this.manager,
      `
        UPDATE gift_requests request
        SET status = $2, status_reason = $4, updated_at = now()
        FROM posts post
        WHERE post.global_id = request.post_id
          AND request.post_id = ANY($1::uuid[])
          AND request.status::text = ANY($3::text[])
          AND request.deleted_at IS NULL
          AND ($5::text IS NULL OR post.status::text = $5::text)
        RETURNING request.global_id, request.requester_id,
                  request.post_id, post.title AS post_title
      `,
      [
        params.postIds,
        params.status,
        [GiftRequestStatuses.PENDING, GiftRequestStatuses.STANDBY],
        params.statusReason ?? null,
        params.onlyIfPostStatus ?? null,
      ],
    );

    return rows.map((row) => ({
      requestId: row.global_id,
      requesterId: row.requester_id,
      postId: row.post_id,
      postTitle: row.post_title,
    }));
  }

  public async rejectIfOpen(params: {
    postId: string;
    requestId: string;
  }): Promise<IGiftRequestEntity | null> {
    // Một câu có điều kiện, không đọc-rồi-ghi: cùng lý do với
    // `withdrawIfPending` — một lượt duyệt commit xen vào giữa sẽ bị câu ghi ở
    // đây đè mất, để lại giao dịch đang sống gắn với yêu cầu mang trạng thái
    // REJECTED.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE gift_requests
       SET status = $1, status_reason = NULL, updated_at = now()
       WHERE global_id = $2 AND post_id = $3
         AND status::text = ANY($4::text[]) AND deleted_at IS NULL
       RETURNING global_id`,
      [
        GiftRequestStatuses.REJECTED,
        params.requestId,
        params.postId,
        [GiftRequestStatuses.PENDING, GiftRequestStatuses.STANDBY],
      ],
    );

    if (rows.length === 0) return null;

    return this.findOne({ where: { globalId: rows[0].global_id } as never });
  }

  public async findRedemptionContext(params: {
    postId: string;
    requesterId: string;
  }): Promise<IRedemptionContext | null> {
    // `INNER JOIN` trên yêu cầu: người chưa xin thì không có gì để đổi. F75 nói
    // "người xin có hai đường — chờ, hoặc dùng điểm", nên dùng điểm là một nhánh
    // CỦA việc xin, không phải một lối tắt vòng qua nó.
    const [row] = await this.manager.query<
      {
        request_global_id: string;
        requested_quantity: number | string;
        giver_id: string;
        post_status: string;
        selection_deadline: Date | null;
        estimated_value: string | null;
      }[]
    >(
      `
        SELECT candidate.global_id AS request_global_id,
               candidate.requested_quantity,
               post.author_id AS giver_id,
               post.status AS post_status,
               post.selection_deadline,
               post.details ->> 'estimatedValue' AS estimated_value
        FROM gift_requests candidate
        INNER JOIN posts post ON post.global_id = candidate.post_id
        WHERE candidate.post_id = $1
          AND candidate.requester_id = $2
          AND candidate.status = $3
          AND candidate.deleted_at IS NULL
          AND post.deleted_at IS NULL
          -- CHỈ bài Muốn Tặng. Tới 11/10 chốt này nằm ngầm trong phép kiểm đồng hồ:
          -- bài Muốn Nhận không có selection_deadline nên không bao giờ "đang chạy".
          -- Bật vòng đời 7+30 cho cả Muốn Nhận (CHỐT-10 mục 1) làm chốt ngầm đó biến
          -- mất, và bài Muốn Nhận có khai giá trị thì ĐỔI ĐƯỢC — trong khi ở bài đó
          -- người xin là người TẶNG, tức trừ điểm của người đang cho đồ. Lọc ở đây
          -- vì đây là nguồn dùng chung của cả báo giá lẫn lệnh đổi.
          AND post.post_type = 'OFFER'
      `,
      [params.postId, params.requesterId, GiftRequestStatuses.PENDING],
    );

    if (!row) return null;

    return {
      requestGlobalId: row.request_global_id,
      requestedQuantity: Number(row.requested_quantity),
      giverId: row.giver_id,
      postStatus: row.post_status,
      selectionDeadline: row.selection_deadline,
      estimatedValueVnd:
        row.estimated_value === null ? null : Number(row.estimated_value),
    };
  }

  public async findPostsDueForSelection(
    limit: number,
    includeClassified = false,
  ): Promise<{ postId: string; giverId: string }[]> {
    const rows = await this.manager.query<
      { post_id: string; giver_id: string }[]
    >(
      `
        SELECT post.global_id AS post_id, post.author_id AS giver_id
        FROM posts post
        WHERE post.selection_deadline IS NOT NULL
          AND post.selection_deadline <= now()
          AND post.status = $1
          AND post.deleted_at IS NULL
          AND ($4::boolean OR post.post_type <> 'CLASSIFIED')
          AND EXISTS (
            SELECT 1 FROM gift_requests candidate
            INNER JOIN users person ON person.global_id = candidate.requester_id
            WHERE candidate.post_id = post.global_id
              AND candidate.status = $2
              AND candidate.deleted_at IS NULL
              AND candidate.requested_quantity <= post.remaining_quantity
              AND ${eligibleRequesterSql('person')}
          )
        ORDER BY post.selection_deadline ASC
        LIMIT $3
      `,
      [
        GiftPostStatuses.PUBLISHED,
        GiftRequestStatuses.PENDING,
        limit,
        includeClassified,
      ],
    );

    return rows.map((row) => ({
      postId: row.post_id,
      giverId: row.giver_id,
    }));
  }

  public async findStandbyNudges(limit: number): Promise<IStandbyNudgeRow[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        requester_id: string;
        post_id: string;
        post_title: string;
        remaining_quantity: number | string;
        requested_quantity: number | string;
      }[]
    >(
      `
        SELECT request.global_id, request.requester_id, post.global_id AS post_id,
               post.title AS post_title, post.remaining_quantity, request.requested_quantity
          FROM gift_requests request
          JOIN posts post ON post.global_id = request.post_id
         WHERE request.status = 'STANDBY'
           AND request.status_reason = 'INSUFFICIENT_QUANTITY'
           AND request.deleted_at IS NULL
           AND post.deleted_at IS NULL
           AND post.status = 'PUBLISHED'
           AND post.remaining_quantity > 0
           -- Đã quá hạn xét; hoặc bài chọn tay (không có mốc) mà họ đã chờ quá 3 ngày — tránh
           -- nhắc ngay sau thông báo chuyển STANDBY.
           AND ((post.selection_deadline IS NOT NULL AND post.selection_deadline <= now())
                OR (post.selection_deadline IS NULL
                    AND request.updated_at <= now() - interval '3 days'))
           -- Còn người vừa số thì chủ bài / job xét họ trước — chưa cần nhắc.
           AND NOT EXISTS (
             SELECT 1 FROM gift_requests fitting
              WHERE fitting.post_id = post.global_id
                AND fitting.status = 'PENDING'
                AND fitting.deleted_at IS NULL)
         ORDER BY request.queue_joined_at ASC, request.id ASC
         LIMIT $1
      `,
      [limit],
    );
    return rows.map((row) => ({
      requestId: row.global_id,
      requesterId: row.requester_id,
      postId: row.post_id,
      postTitle: row.post_title,
      remainingQuantity: Number(row.remaining_quantity),
      requestedQuantity: Number(row.requested_quantity),
    }));
  }

  public async listCandidateMetrics(
    postId: string,
  ): Promise<ICandidateMetricsWithId[]> {
    // Khoảng cách đo từ Vị trí mặc định của ứng viên tới vị trí BÀI. `NULL` khi
    // họ chưa đặt vị trí — hàm xếp coi đó là "không biết" và đẩy xuống cuối tiêu
    // chí NEAREST, chứ không coi là 0 mét.
    const rows = await this.manager.query<
      {
        request_global_id: string;
        requester_id: string;
        queue_joined_at: Date;
        request_id: string;
        rank: UserRanks;
        distance_meters: string | null;
        received_count: string;
        cancellation_count: string;
      }[]
    >(
      `
        SELECT candidate.global_id AS request_global_id,
               candidate.requester_id,
               candidate.queue_joined_at,
               candidate.id AS request_id,
               person.rank,
               CASE
                 WHEN person.default_location IS NULL THEN NULL
                 ELSE ST_Distance(person.default_location, post.location)
               END AS distance_meters,
               received.total AS received_count,
               cancelled.total AS cancellation_count
        FROM gift_requests candidate
        INNER JOIN posts post ON post.global_id = candidate.post_id
        INNER JOIN users person ON person.global_id = candidate.requester_id
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS total
          FROM gift_transactions done
          WHERE done.receiver_id = candidate.requester_id
            AND done.status = 'COMPLETED'
        ) received
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS total
          FROM gift_transactions dropped
          WHERE dropped.closed_by = candidate.requester_id
            AND dropped.status = 'CANCELLED'
            -- Không tính lượt huỷ mà người này huỷ để TỰ VỆ.
            --
            -- Huỷ là cửa thoát duy nhất khi bị quấy rối giữa chừng: nó khoá
            -- phòng chat ngay. Nhưng nếu lượt huỷ đó vẫn tính vào đây thì nạn
            -- nhân phải tự hạ thứ hạng của mình để thoát, còn kẻ quấy rối không
            -- mất gì.
            --
            -- Điều kiện là báo xấu ĐÃ ĐƯỢC XÁC MINH (RESOLVED), không phải
            -- vừa gửi: trừ ngay lúc gửi thì ai cũng gửi một báo xấu vu vơ để né
            -- hình phạt huỷ. Con số này tính sống mỗi lần xếp hạng, nên nó TỰ
            -- SỬA khi Admin kết luận — không cần bút toán ngược hay job vá.
            AND NOT EXISTS (
              SELECT 1 FROM reports upheld
              WHERE upheld.reporter_user_id = candidate.requester_id
                AND upheld.status = 'RESOLVED'
                AND (
                  -- Nhắm vào bên KIA của chính lượt trao đó.
                  (upheld.target_type = 'USER'
                   AND upheld.target_id = CASE
                         WHEN dropped.receiver_id = candidate.requester_id
                           THEN dropped.giver_id
                         ELSE dropped.receiver_id
                       END)
                  -- Hoặc vào chính bài của lượt trao: bài sai sự thật thì huỷ
                  -- cũng không phải lỗi của người huỷ.
                  OR (upheld.target_type = 'POST'
                      AND upheld.target_id = dropped.post_id)
                )
            )
        ) cancelled
        WHERE candidate.post_id = $1
          AND candidate.status = $2
          AND candidate.deleted_at IS NULL
          -- Chỉ người vừa số còn lại: hệ thống duyệt ĐỦ số người ta xin, không duyệt một phần.
          AND candidate.requested_quantity <= post.remaining_quantity
          AND ${eligibleRequesterSql('person')}
      `,
      [postId, GiftRequestStatuses.PENDING],
    );

    return rows.map((row) => ({
      requestGlobalId: row.request_global_id,
      requesterId: row.requester_id,
      queueJoinedAt: row.queue_joined_at,
      requestId: Number(row.request_id),
      rank: row.rank,
      distanceMeters:
        row.distance_meters === null ? null : Number(row.distance_meters),
      receivedCount: Number(row.received_count),
      cancellationCount: Number(row.cancellation_count),
    }));
  }

  public async acceptRequest(params: {
    requestId: string;
    postId: string;
    /**
     * Người BẤM duyệt — luôn là tác giả bài, và chỉ dùng để xác thực quyền.
     *
     * Tới 11/10 tham số này tên `giverId`, và cái tên đó là một giả định đóng
     * cứng: với bài Muốn Nhận, tác giả là người muốn NHẬN. Vai được suy từ
     * `giftTransactionRoles` bên dưới, không nhận từ nơi gọi — nơi gọi không có
     * cách nào truyền sai nữa.
     */
    actorUserId: string;
    transactionId: string;
    /**
     * Khoản trừ điểm của lượt đổi-bằng-điểm, ghi TRONG transaction này.
     *
     * Xem ghi chú ở port: để nó ở một transaction riêng rồi bù khi duyệt hỏng là
     * đúng về số mà sai về trạng thái.
     */
    readonly redemption?: {
      readonly requesterId: string;
      readonly points: number;
      readonly idempotencyKey: string;
      readonly reason: string;
    };
    /**
     * Lý do hệ thống tự chọn người này (PR #46 §9). Ghi TRONG transaction này, nên lượt trao
     * tự chọn và lý do của nó cùng commit hoặc cùng mất. Bỏ trống cho lượt chủ bài bấm duyệt.
     */
    readonly selectionAudit?: IRecipientSelectionAudit;
    /**
     * Rao vặt không tạo lượt trao mới (PR #46 §8). Chặn NGAY TẠI ĐÂY, dưới khoá hàng, để
     * không đường gọi nào lách được — `true` chỉ khi nơi gọi đã kiểm Admin bật lại luồng cũ
     * (`classified.legacy_transactions_enabled = 1`).
     */
    readonly allowClassified?: boolean;
  }): Promise<{
    transactionId: string;
    /** Vai đã phân giải, để nơi gọi gửi thông báo mà khỏi tự đoán lại. */
    giverId: string;
    receiverId: string;
    debit?: IAppendPointEntryResult;
    rebalanced: IRebalancedRequest[];
  }> {
    return this.manager.transaction(async (manager) => {
      // Khoá CẢ request STANDBY: cuối hàm `rebalanceOpenRequests` ghi lên chúng (đổi lý do,
      // hoặc chuyển qua lại PENDING/STANDBY). Khoá thiếu là cửa cho deadlock với lượt duyệt khác.
      const openRows = await manager.query<
        {
          global_id: string;
          post_id: string;
          requester_id: string;
          status: string;
          requested_quantity: number | string;
        }[]
      >(
        `SELECT global_id, post_id, requester_id, status, requested_quantity
         FROM gift_requests
         WHERE post_id = $1 AND status IN ('PENDING', 'STANDBY') AND deleted_at IS NULL
         ORDER BY global_id
         FOR UPDATE`,
        [params.postId],
      );

      // Chỉ duyệt request PENDING. STANDBY nghĩa là không đủ hàng cho số người đó xin — duyệt
      // nó là duyệt vượt kho, hoặc phải tự giảm số người ta đăng ký; cả hai đều cấm.
      const targetRequest = openRows?.find(
        (row) =>
          row.global_id === params.requestId &&
          row.status === GiftRequestStatuses.PENDING,
      );

      if (!targetRequest)
        throw new GiftRequestNotFoundException(params.requestId);

      // Luồng `/transactions` cũ có thể đã tạo sẵn một lượt cho đúng cặp
      // bài–người nhận này. Khoá nó TRƯỚC `posts`.
      const transactionRows = await manager.query<
        { global_id: string; status: string; quantity: string }[]
      >(
        `SELECT global_id, status, quantity FROM gift_transactions
         WHERE post_id = $1 AND (receiver_id = $2 OR giver_id = $2)
           -- Khoá theo ĐỐI PHƯƠNG, không theo receiver_id. Tới 11/10 câu này
           -- chỉ xét receiver_id = requester_id, đúng cho bài Muốn Tặng và
           -- **không bao giờ khớp** cho bài Muốn Nhận: ở đó người phản hồi là
           -- giver_id, còn receiver_id luôn là tác giả. Phép chống trùng vì
           -- thế im lặng mất tác dụng, và tồn kho bị trừ hai lần cho một lượt.
           --
           -- Tác giả không bao giờ là người phản hồi trên bài của mình
           -- (CannotRequestOwnPostException), nên hai vế OR không chồng nhau.
           -- REQUESTED đã bị gỡ khỏi vòng đời lượt trao ngày 28/09 và nay có
           -- ràng buộc CHK_gift_transactions_live_status chặn, nên để lại trong
           -- danh sách này chỉ gây tưởng là còn dùng.
           AND status IN ('ACCEPTED', 'DELIVERING')
         FOR UPDATE`,
        [params.postId, targetRequest.requester_id],
      );
      const existingTransaction = transactionRows?.[0];

      // Đã duyệt rồi thì tồn kho đã bị trừ ở luồng kia. Duyệt tiếp là trừ hai
      // lần cho MỘT lượt bàn giao.
      if (existingTransaction && existingTransaction.status !== 'REQUESTED')
        throw new GiftTransactionInvalidStateException(
          existingTransaction.status,
        );

      // Duyệt ĐỦ số người đó xin — không duyệt một phần. Nhận nuôi lượt cũ thì trừ đúng số của
      // lượt đó: `close()` hoàn lại theo `quantity` đã ghi, trừ khác số là tồn kho tự nở ra.
      const quantity = existingTransaction
        ? Number(existingTransaction.quantity)
        : Number(targetRequest.requested_quantity);

      const postRows = await manager.query<
        {
          global_id: string;
          author_id: string;
          post_type: string;
          status: string;
          remaining_quantity: number;
        }[]
      >(
        `SELECT global_id, author_id, post_type, status, remaining_quantity FROM posts WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.postId],
      );

      if (!postRows || postRows.length === 0) {
        throw new PostNotFoundException(params.postId);
      }
      const post = postRows[0];

      // Tác giả bài là người QUYẾT, bất kể họ cho hay nhận. Giữ nguyên phép kiểm,
      // chỉ đổi tên tham số cho đúng nghĩa.
      if (post.author_id !== params.actorUserId) {
        throw new ForbiddenException();
      }
      if (post.post_type === PostTypes.CLASSIFIED && !params.allowClassified)
        throw new ClassifiedTransactionNotSupportedException();

      // Vai suy từ LOẠI bài, không nhận từ nơi gọi — xem `giftTransactionRoles`.
      // Với bài Muốn Nhận hai vai ĐẢO lại: tác giả là người nhận.
      const roles = giftTransactionRoles({
        postType: post.post_type as PostTypes,
        postAuthorId: post.author_id,
        requesterId: targetRequest.requester_id,
      });

      if (post.status !== GiftPostStatuses.PUBLISHED) {
        throw new PostInvalidStateException();
      }

      if (Number(post.remaining_quantity) < quantity) {
        throw new GiftTransactionOutOfStockException();
      }

      // Trừ điểm ở ĐÂY, sau mọi phép kiểm và trước mọi lượt ghi.
      //
      // Sau phép kiểm: hết hàng, bài sai trạng thái, không phải tác giả — cả ba
      // ném trước khi có bút toán nào, nên không còn gì phải hoàn. Đường hoàn bù
      // `ITEM_REDEMPTION:REFUND:<requestId>` của bản cũ vì thế biến mất cùng lý do
      // tồn tại của nó.
      //
      // Và sau mọi lượt `FOR UPDATE` ở trên: `appendAdjustmentWithinTransaction`
      // xin `pg_advisory_xact_lock(hashtext(userId))`, nên thứ tự xin khoá ở đường
      // này là HÀNG trước, ADVISORY sau — cùng thứ tự với `complete()`. Đảo lại là
      // dựng một ca deadlock giữa hai đường mà không phép kiểm nào thấy.
      const debit = params.redemption
        ? await this.ledger.appendAdjustmentWithinTransaction(manager, {
            userId: params.redemption.requesterId,
            ruleCode: 'ITEM_REDEMPTION',
            delta: -params.redemption.points,
            referenceType: 'POST',
            referenceId: params.postId,
            idempotencyKey: params.redemption.idempotencyKey,
            actor: params.redemption.requesterId,
            source: 'REDEMPTION',
            reason: params.redemption.reason,
          })
        : undefined;

      const newRemaining = Number(post.remaining_quantity) - quantity;
      // `RESERVED`, không `DELIVERING`: chốt 29/09 giữ MỘT tên cho trạng thái
      // "kho đã cạn, lượt trao đang chạy". Hai tên nghĩa là mọi chỗ đọc phải kiểm
      // cả hai, và chỗ nào quên một tên là một lỗ thật — `syncPostStatus` từng
      // quên, nên bài đã giao hết suất không bao giờ được suy lại trạng thái và
      // tác giả mất vĩnh viễn một suất đăng bài. Xem migration `1795200000000`.
      const newPostStatus = newRemaining === 0 ? 'RESERVED' : 'PUBLISHED';

      await manager.query(
        // `selection_deadline = NULL`: đồng hồ chọn người nhận đã hết việc. Để
        // lại mốc cũ thì job tự chọn sẽ nhặt đúng bài này lên mỗi lần chạy và
        // cố chọn thêm một người nữa cho một bài đã có chủ.
        // Đồng hồ tự chọn chỉ tắt khi kho về 0. Còn hàng lẻ thì GIỮ mốc — tới hạn job vẫn chọn
        // tiếp người vừa số, thay vì phần còn lại chỉ chờ chủ bài nhớ vào duyệt tay (12/11).
        `UPDATE posts
         SET remaining_quantity = $1, status = $2,
             selection_deadline = CASE WHEN $1::int = 0 THEN NULL ELSE selection_deadline END,
             updated_at = now()
         WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1, status_reason = NULL, updated_at = now() WHERE global_id = $2`,
        [GiftRequestStatuses.ACCEPTED, params.requestId],
      );

      // Người còn lại xin NHIỀU HƠN số vừa còn lại → STANDBY kèm lý do (`OUT_OF_STOCK` khi kho về
      // 0, `INSUFFICIENT_QUANTITY` khi còn ít hơn số họ xin). STANDBY, KHÔNG phải REJECTED: họ vẫn
      // trong hàng và được xét lại khi có hàng hoàn về (F33). Không ai bị tự giảm số đã xin.
      const rebalanced = await rebalanceOpenRequests(manager, params.postId);

      if (existingTransaction) {
        await manager.query(
          `UPDATE gift_transactions SET status = 'ACCEPTED', accepted_at = now(),
                  request_id = COALESCE(request_id, $2) WHERE global_id = $1`,
          [existingTransaction.global_id, params.requestId],
        );
        await this.openChatRoom(manager, {
          transactionId: existingTransaction.global_id,
          postId: params.postId,
          giverId: roles.giverId,
          receiverId: roles.receiverId,
        });
        await this.recordSelectionAudit(manager, {
          transactionId: existingTransaction.global_id,
          postId: params.postId,
          requestId: params.requestId,
          audit: params.selectionAudit,
        });
        return {
          transactionId: existingTransaction.global_id,
          ...roles,
          debit,
          rebalanced,
        };
      }

      await manager.query(
        `INSERT INTO gift_transactions (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at, request_id) VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', now(), $6)`,
        [
          params.transactionId,
          params.postId,
          roles.giverId,
          roles.receiverId,
          quantity,
          params.requestId,
        ],
      );

      await this.openChatRoom(manager, {
        transactionId: params.transactionId,
        postId: params.postId,
        giverId: roles.giverId,
        receiverId: roles.receiverId,
      });
      await this.recordSelectionAudit(manager, {
        transactionId: params.transactionId,
        postId: params.postId,
        requestId: params.requestId,
        audit: params.selectionAudit,
      });

      return {
        transactionId: params.transactionId,
        ...roles,
        debit,
        rebalanced,
      };
    });
  }

  private async recordSelectionAudit(
    manager: EntityManager,
    params: {
      transactionId: string;
      postId: string;
      requestId: string;
      audit: IRecipientSelectionAudit | undefined;
    },
  ): Promise<void> {
    if (!params.audit) return;
    const { audit } = params;
    await manager.query(
      `INSERT INTO recipient_selection_audits
         (transaction_id, post_id, request_id, requester_id, trigger, deciding_criterion,
          criteria_order, winner_metrics, runner_up_metrics, candidate_count)
       VALUES ($1, $2, $3, $4, 'AUTOMATIC', $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)`,
      [
        params.transactionId,
        params.postId,
        params.requestId,
        audit.winner.requesterId,
        audit.decidingCriterion,
        JSON.stringify(audit.order),
        JSON.stringify(audit.winner),
        audit.runnerUp ? JSON.stringify(audit.runnerUp) : null,
        audit.candidateCount,
      ],
    );
  }

  public async acceptRequestsBatch(params: {
    postId: string;
    /** Người BẤM duyệt — tác giả bài. Vai suy trong hàm, xem `acceptRequest`. */
    actorUserId: string;
    requestIds: readonly string[];
    /**
     * Rao vặt không tạo lượt trao mới (PR #46 §8). Chặn NGAY TẠI ĐÂY, dưới khoá hàng, để
     * không đường gọi nào lách được — `true` chỉ khi nơi gọi đã kiểm Admin bật lại luồng cũ
     * (`classified.legacy_transactions_enabled = 1`).
     */
    readonly allowClassified?: boolean;
  }): Promise<{
    accepted: {
      requestId: string;
      requesterId: string;
      transactionId: string;
      giverId: string;
      receiverId: string;
    }[];
    remainingQuantity: number;
    standbyCount: number;
    rebalanced: IRebalancedRequest[];
  }> {
    return this.manager.transaction(async (manager) => {
      // Khoá đúng tập PENDING của bài, y như `acceptRequest`. `ORDER BY global_id`
      // để hai lô chạy song song trên cùng bài lấy khoá theo cùng thứ tự và
      // không deadlock nhau.
      // Khoá cả STANDBY như `acceptRequest` — phép cân lại cuối lô ghi lên chúng.
      const openRows = await manager.query<
        {
          global_id: string;
          requester_id: string;
          status: string;
          requested_quantity: number | string;
        }[]
      >(
        `SELECT global_id, requester_id, status, requested_quantity
         FROM gift_requests
         WHERE post_id = $1 AND status IN ('PENDING', 'STANDBY') AND deleted_at IS NULL
         ORDER BY global_id
         FOR UPDATE`,
        [params.postId],
      );

      const pendingRows = (openRows ?? []).filter(
        (row) => row.status === GiftRequestStatuses.PENDING,
      );
      const pendingById = new Map(
        pendingRows.map((row) => [row.global_id, row.requester_id]),
      );
      const quantityById = new Map(
        pendingRows.map((row) => [
          row.global_id,
          Number(row.requested_quantity),
        ]),
      );

      // Kiểm CẢ LÔ trước khi ghi bất cứ thứ gì. Một id sai trong lô làm cả lô
      // dừng, chứ không duyệt những cái đúng rồi báo lỗi cái sai — chủ bài sẽ
      // không biết phần nào đã chạy.
      for (const requestId of params.requestIds)
        if (!pendingById.has(requestId))
          throw new GiftRequestNotFoundException(requestId);

      const requesterIds = params.requestIds.map(
        (requestId) => pendingById.get(requestId) as string,
      );

      // Mọi lượt trao CÒN SỐNG của đúng những người này trên bài này, lấy một
      // câu. `REQUESTED` không còn trong vòng đời (CHK_gift_transactions_live_status),
      // nên bất cứ hàng nào tìm thấy đều là một lượt đang chạy — duyệt thêm là
      // trừ tồn kho hai lần cho một lượt bàn giao.
      const liveRows = await manager.query<
        { receiver_id: string; status: string }[]
      >(
        `SELECT receiver_id, giver_id, status FROM gift_transactions
         -- Khoá theo ĐỐI PHƯƠNG, cùng lý do như ở acceptRequest: với bài Muốn
         -- Nhận, người phản hồi là giver_id, nên lọc theo receiver_id không
         -- bao giờ khớp và phép chống trùng im lặng mất tác dụng.
         WHERE post_id = $1
           AND (receiver_id = ANY($2::uuid[]) OR giver_id = ANY($2::uuid[]))
           AND status IN ('ACCEPTED', 'DELIVERING')
         FOR UPDATE`,
        [params.postId, requesterIds],
      );
      if (liveRows && liveRows.length > 0)
        throw new GiftTransactionInvalidStateException(liveRows[0].status);

      const postRows = await manager.query<
        {
          global_id: string;
          author_id: string;
          post_type: string;
          status: string;
          remaining_quantity: number;
        }[]
      >(
        `SELECT global_id, author_id, post_type, status, remaining_quantity FROM posts
         WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.postId],
      );
      if (!postRows || postRows.length === 0)
        throw new PostNotFoundException(params.postId);

      const post = postRows[0];
      if (post.author_id !== params.actorUserId) throw new ForbiddenException();
      if (post.post_type === PostTypes.CLASSIFIED && !params.allowClassified)
        throw new ClassifiedTransactionNotSupportedException();
      if (post.status !== GiftPostStatuses.PUBLISHED)
        throw new PostInvalidStateException();

      // Mỗi request ăn ĐỦ số nó xin; tổng lô vượt số còn lại thì cả lô dừng — không duyệt một
      // phần lô, không duyệt một phần request. Nhánh "nhận nuôi lượt cũ" của `acceptRequest`
      // không tới được đây, vì mọi lượt còn sống đã bị chặn ở trên.
      const needed = params.requestIds.reduce(
        (sum, requestId) => sum + (quantityById.get(requestId) ?? 1),
        0,
      );
      if (Number(post.remaining_quantity) < needed)
        throw new GiftTransactionOutOfStockException();

      const newRemaining = Number(post.remaining_quantity) - needed;
      const newPostStatus = newRemaining === 0 ? 'RESERVED' : 'PUBLISHED';

      await manager.query(
        // Đồng hồ tự chọn chỉ tắt khi kho về 0. Còn hàng lẻ thì GIỮ mốc — tới hạn job vẫn chọn
        // tiếp người vừa số, thay vì phần còn lại chỉ chờ chủ bài nhớ vào duyệt tay (12/11).
        `UPDATE posts
         SET remaining_quantity = $1, status = $2,
             selection_deadline = CASE WHEN $1::int = 0 THEN NULL ELSE selection_deadline END,
             updated_at = now()
         WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1, status_reason = NULL, updated_at = now()
         WHERE global_id = ANY($2::uuid[])`,
        [GiftRequestStatuses.ACCEPTED, [...params.requestIds]],
      );

      // Cân hàng chờ đúng MỘT lần, ở cuối — sau khi cả lô đã ACCEPTED, nên không cướp request
      // nào TRONG lô. Đếm những người vừa bị chuyển từ PENDING sang STANDBY.
      const rebalanced = await rebalanceOpenRequests(manager, params.postId);
      const standbyCount = rebalanced.filter(
        (row) => row.fromStatus === 'PENDING' && row.toStatus === 'STANDBY',
      ).length;

      const accepted: {
        requestId: string;
        requesterId: string;
        transactionId: string;
        giverId: string;
        receiverId: string;
      }[] = [];

      for (const requestId of params.requestIds) {
        const requesterId = pendingById.get(requestId) as string;
        const transactionId = makeGlobalId(
          `/transactions/${params.postId}/${requesterId}/${requestId}`,
        );

        const roles = giftTransactionRoles({
          postType: post.post_type as PostTypes,
          postAuthorId: post.author_id,
          requesterId,
        });

        await manager.query(
          `INSERT INTO gift_transactions
             (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at, request_id)
           VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', now(), $6)`,
          [
            transactionId,
            params.postId,
            roles.giverId,
            roles.receiverId,
            quantityById.get(requestId) ?? 1,
            requestId,
          ],
        );

        await this.openChatRoom(manager, {
          transactionId,
          postId: params.postId,
          giverId: roles.giverId,
          receiverId: roles.receiverId,
        });

        accepted.push({ requestId, requesterId, transactionId, ...roles });
      }

      return {
        accepted,
        remainingQuantity: newRemaining,
        standbyCount,
        rebalanced,
      };
    });
  }

  /**
   * Mở phòng chat trong CÙNG transaction với lượt duyệt (F34).
   *
   * Nằm trong transaction chứ không gọi sau: duyệt xong mà chat chưa mở thì hai
   * bên không có đường liên lạc để hẹn trao đồ, và không có ai đi dọn những
   * lượt duyệt thiếu phòng.
   */
  private async openChatRoom(
    manager: EntityManager,
    params: {
      transactionId: string;
      postId: string;
      giverId: string;
      receiverId: string;
    },
  ): Promise<void> {
    await this.chat.openRoomWithinTransaction(manager, {
      globalId: randomUUID(),
      transactionId: params.transactionId,
      postId: params.postId,
      giverId: params.giverId,
      receiverId: params.receiverId,
    });
  }
}
