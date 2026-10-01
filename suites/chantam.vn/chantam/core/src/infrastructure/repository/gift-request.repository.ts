import {
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
  IGiftRequestRepository,
  IMyGiftRequestRow,
  IRedemptionContext,
} from '@/domain/ports/repository';
import { GiftRequestEntity, UserEntity } from '@/infrastructure/entity';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';
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
];

interface IMyRequestRow {
  global_id: string;
  post_id: string;
  requester_id: string;
  message: string;
  status: GiftRequestStatuses;
  queue_joined_at: Date;
  withdrawn_at: Date | null;
  offering_post_id: string | null;
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
  ) {
    super(target, manager);
  }

  public async findByPostAndRequester(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null> {
    return this.findOne({
      where: {
        postId,
        requesterId,
      } as never,
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
       SET status = $1, withdrawn_at = now(), updated_at = now()
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
      .addSelect('COUNT(*)', 'cnt')
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

  public async findStatusesByPostIdsAndRequester(
    postIds: string[],
    requesterId: string,
  ): Promise<Map<string, GiftRequestStatuses>> {
    const map = new Map<string, GiftRequestStatuses>();
    if (postIds.length === 0 || !requesterId) return map;

    const items = await this.find({
      where: {
        postId: In(postIds),
        requesterId,
      } as never,
    });

    for (const item of items) {
      map.set(item.postId, item.status);
    }
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

  public async closeOpenForPosts(params: {
    postIds: string[];
    status: GiftRequestStatuses;
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
        SET status = $2, updated_at = now()
        FROM posts post
        WHERE post.global_id = request.post_id
          AND request.post_id = ANY($1::uuid[])
          AND request.status::text = ANY($3::text[])
          AND request.deleted_at IS NULL
        RETURNING request.global_id, request.requester_id,
                  request.post_id, post.title AS post_title
      `,
      [
        params.postIds,
        params.status,
        [GiftRequestStatuses.PENDING, GiftRequestStatuses.STANDBY],
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
       SET status = $1, updated_at = now()
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
        giver_id: string;
        post_status: string;
        selection_deadline: Date | null;
        estimated_value: string | null;
      }[]
    >(
      `
        SELECT candidate.global_id AS request_global_id,
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
      `,
      [params.postId, params.requesterId, GiftRequestStatuses.PENDING],
    );

    if (!row) return null;

    return {
      requestGlobalId: row.request_global_id,
      giverId: row.giver_id,
      postStatus: row.post_status,
      selectionDeadline: row.selection_deadline,
      estimatedValueVnd:
        row.estimated_value === null ? null : Number(row.estimated_value),
    };
  }

  public async findPostsDueForSelection(
    limit: number,
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
          AND EXISTS (
            SELECT 1 FROM gift_requests candidate
            WHERE candidate.post_id = post.global_id
              AND candidate.status = $2
              AND candidate.deleted_at IS NULL
          )
        ORDER BY post.selection_deadline ASC
        LIMIT $3
      `,
      [GiftPostStatuses.PUBLISHED, GiftRequestStatuses.PENDING, limit],
    );

    return rows.map((row) => ({
      postId: row.post_id,
      giverId: row.giver_id,
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
    giverId: string;
    transactionId: string;
  }): Promise<{ transactionId: string }> {
    return this.manager.transaction(async (manager) => {
      const pendingRows = await manager.query<
        {
          global_id: string;
          post_id: string;
          requester_id: string;
          status: string;
        }[]
      >(
        `SELECT global_id, post_id, requester_id, status
         FROM gift_requests
         WHERE post_id = $1 AND status = $2 AND deleted_at IS NULL
         ORDER BY global_id
         FOR UPDATE`,
        [params.postId, GiftRequestStatuses.PENDING],
      );

      const targetRequest = pendingRows?.find(
        (row) => row.global_id === params.requestId,
      );

      if (!targetRequest)
        throw new GiftRequestNotFoundException(params.requestId);

      // Luồng `/transactions` cũ có thể đã tạo sẵn một lượt cho đúng cặp
      // bài–người nhận này. Khoá nó TRƯỚC `posts`.
      const transactionRows = await manager.query<
        { global_id: string; status: string; quantity: string }[]
      >(
        `SELECT global_id, status, quantity FROM gift_transactions
         WHERE post_id = $1 AND receiver_id = $2
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

      // Nhận nuôi lượt cũ thì phải trừ đúng số lượng của nó: `close()` hoàn lại
      // theo `quantity` đã ghi, trừ 1 mà hoàn N là tồn kho tự nở ra.
      const quantity = existingTransaction
        ? Number(existingTransaction.quantity)
        : 1;

      const postRows = await manager.query<
        {
          global_id: string;
          author_id: string;
          status: string;
          remaining_quantity: number;
        }[]
      >(
        `SELECT global_id, author_id, status, remaining_quantity FROM posts WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.postId],
      );

      if (!postRows || postRows.length === 0) {
        throw new PostNotFoundException(params.postId);
      }
      const post = postRows[0];

      if (post.author_id !== params.giverId) {
        throw new ForbiddenException();
      }

      if (post.status !== GiftPostStatuses.PUBLISHED) {
        throw new PostInvalidStateException();
      }

      if (Number(post.remaining_quantity) < quantity) {
        throw new GiftTransactionOutOfStockException();
      }

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
        `UPDATE posts
         SET remaining_quantity = $1, status = $2,
             selection_deadline = NULL, updated_at = now()
         WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1, updated_at = now() WHERE global_id = $2`,
        [GiftRequestStatuses.ACCEPTED, params.requestId],
      );

      if (newRemaining === 0) {
        // STANDBY, KHÔNG phải REJECTED: hết hàng thì những người còn lại vẫn
        // đang trong hàng đợi, và nếu lượt trao này bị huỷ thì họ được xét tiếp
        // (F33). `REJECTED` để dành cho lúc người cho chủ động từ chối ai đó —
        // dùng chung một trạng thái cho hai việc thì không phân biệt được
        // "chưa tới lượt" với "đã bị loại".
        await manager.query(
          `UPDATE gift_requests SET status = $1, updated_at = now() WHERE post_id = $2 AND global_id != $3 AND status = $4`,
          [
            GiftRequestStatuses.STANDBY,
            params.postId,
            params.requestId,
            GiftRequestStatuses.PENDING,
          ],
        );
      }

      if (existingTransaction) {
        await manager.query(
          `UPDATE gift_transactions SET status = 'ACCEPTED', accepted_at = now() WHERE global_id = $1`,
          [existingTransaction.global_id],
        );
        await this.openChatRoom(manager, {
          transactionId: existingTransaction.global_id,
          postId: params.postId,
          giverId: params.giverId,
          receiverId: targetRequest.requester_id,
        });
        return { transactionId: existingTransaction.global_id };
      }

      await manager.query(
        `INSERT INTO gift_transactions (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at) VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', now())`,
        [
          params.transactionId,
          params.postId,
          params.giverId,
          targetRequest.requester_id,
          quantity,
        ],
      );

      await this.openChatRoom(manager, {
        transactionId: params.transactionId,
        postId: params.postId,
        giverId: params.giverId,
        receiverId: targetRequest.requester_id,
      });

      return { transactionId: params.transactionId };
    });
  }

  public async acceptRequestsBatch(params: {
    postId: string;
    giverId: string;
    requestIds: readonly string[];
  }): Promise<{
    accepted: {
      requestId: string;
      requesterId: string;
      transactionId: string;
    }[];
    remainingQuantity: number;
    standbyCount: number;
  }> {
    return this.manager.transaction(async (manager) => {
      // Khoá đúng tập PENDING của bài, y như `acceptRequest`. `ORDER BY global_id`
      // để hai lô chạy song song trên cùng bài lấy khoá theo cùng thứ tự và
      // không deadlock nhau.
      const pendingRows = await manager.query<
        { global_id: string; requester_id: string }[]
      >(
        `SELECT global_id, requester_id
         FROM gift_requests
         WHERE post_id = $1 AND status = $2 AND deleted_at IS NULL
         ORDER BY global_id
         FOR UPDATE`,
        [params.postId, GiftRequestStatuses.PENDING],
      );

      const pendingById = new Map(
        (pendingRows ?? []).map((row) => [row.global_id, row.requester_id]),
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
        `SELECT receiver_id, status FROM gift_transactions
         WHERE post_id = $1 AND receiver_id = ANY($2::uuid[])
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
          status: string;
          remaining_quantity: number;
        }[]
      >(
        `SELECT global_id, author_id, status, remaining_quantity FROM posts
         WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.postId],
      );
      if (!postRows || postRows.length === 0)
        throw new PostNotFoundException(params.postId);

      const post = postRows[0];
      if (post.author_id !== params.giverId) throw new ForbiddenException();
      if (post.status !== GiftPostStatuses.PUBLISHED)
        throw new PostInvalidStateException();

      // Mỗi yêu cầu duyệt theo đường này ăn đúng MỘT suất: nhánh "nhận nuôi lượt
      // cũ" của `acceptRequest` không tới được đây, vì mọi lượt còn sống đã bị
      // chặn ở trên.
      const needed = params.requestIds.length;
      if (Number(post.remaining_quantity) < needed)
        throw new GiftTransactionOutOfStockException();

      const newRemaining = Number(post.remaining_quantity) - needed;
      const newPostStatus = newRemaining === 0 ? 'RESERVED' : 'PUBLISHED';

      await manager.query(
        `UPDATE posts
         SET remaining_quantity = $1, status = $2,
             selection_deadline = NULL, updated_at = now()
         WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1, updated_at = now()
         WHERE global_id = ANY($2::uuid[])`,
        [GiftRequestStatuses.ACCEPTED, [...params.requestIds]],
      );

      // Quét STANDBY đúng MỘT lần, ở cuối. Đây là chỗ vòng lặp gọi
      // `acceptRequest` sai: ở đó phép quét chạy ngay khi suất cạn, nên nó cướp
      // luôn những yêu cầu còn lại TRONG CÙNG LÔ.
      let standbyCount = 0;
      if (newRemaining === 0) {
        const swept = await updateReturning<{ global_id: string }>(
          manager,
          `UPDATE gift_requests SET status = $1, updated_at = now()
           WHERE post_id = $2 AND status = $3 AND NOT (global_id = ANY($4::uuid[]))
           RETURNING global_id`,
          [
            GiftRequestStatuses.STANDBY,
            params.postId,
            GiftRequestStatuses.PENDING,
            [...params.requestIds],
          ],
        );
        standbyCount = swept.length;
      }

      const accepted: {
        requestId: string;
        requesterId: string;
        transactionId: string;
      }[] = [];

      for (const requestId of params.requestIds) {
        const requesterId = pendingById.get(requestId) as string;
        const transactionId = makeGlobalId(
          `/transactions/${params.postId}/${requesterId}/${requestId}`,
        );

        await manager.query(
          `INSERT INTO gift_transactions
             (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at)
           VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
          [transactionId, params.postId, params.giverId, requesterId],
        );

        await this.openChatRoom(manager, {
          transactionId,
          postId: params.postId,
          giverId: params.giverId,
          receiverId: requesterId,
        });

        accepted.push({ requestId, requesterId, transactionId });
      }

      return { accepted, remainingQuantity: newRemaining, standbyCount };
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
