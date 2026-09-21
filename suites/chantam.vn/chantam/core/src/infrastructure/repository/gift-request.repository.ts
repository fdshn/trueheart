import {
  GiftRequestNotFoundException,
  GiftTransactionInvalidStateException,
  GiftTransactionOutOfStockException,
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IGiftRequestRepository } from '@/domain/ports/repository';
import { GiftRequestEntity, UserEntity } from '@/infrastructure/entity';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';

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
   * Rút yêu cầu bằng MỘT câu có điều kiện `status = 'PENDING'`.
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
    const rows = await this.manager.query<{ global_id: string }[]>(
      `UPDATE gift_requests
       SET status = $1, withdrawn_at = now(), updated_at = now()
       WHERE post_id = $2 AND requester_id = $3
         AND status = $4 AND deleted_at IS NULL
       RETURNING global_id`,
      [
        GiftRequestStatuses.WITHDRAWN,
        postId,
        requesterId,
        GiftRequestStatuses.PENDING,
      ],
    );

    if (!rows || rows.length === 0) return null;

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
      .andWhere("gr.status NOT IN ('WITHDRAWN', 'CANCELLED')")
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

  public async listByPostId(postId: string): Promise<IPostRequestItemDto[]> {
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
      .getRawMany();

    return rawRows.map((row) => ({
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
  }

  /**
   * Duyệt một yêu cầu xin nhận.
   *
   * THỨ TỰ KHOÁ là `gift_requests` → `gift_transactions` → `posts`, và phải
   * giữ nguyên. `GiftTransactionRepository` khoá `gift_transactions` rồi mới
   * `UPDATE posts`; nếu ở đây khoá `posts` trước thì hai luồng duyệt chạy đồng
   * thời trên cùng một bài tạo thành chờ vòng tròn, Postgres huỷ một bên với
   * `40P01` và người dùng nhận 500 không rõ nguyên nhân.
   *
   * `gift_requests` đứng đầu vì chỉ luồng này chạm tới nó, nên nó nằm ngoài
   * vòng phụ thuộc — và khoá nó trước mới biết được `requester_id` để tìm
   * giao dịch đang mở.
   */
  public async acceptRequest(params: {
    requestId: string;
    postId: string;
    giverId: string;
    transactionId: string;
  }): Promise<{ transactionId: string }> {
    return this.manager.transaction(async (manager) => {
      const requestRows = await manager.query<
        {
          global_id: string;
          post_id: string;
          requester_id: string;
          status: string;
        }[]
      >(
        `SELECT global_id, post_id, requester_id, status FROM gift_requests WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.requestId],
      );

      if (
        !requestRows ||
        requestRows.length === 0 ||
        requestRows[0].post_id !== params.postId ||
        requestRows[0].status !== GiftRequestStatuses.PENDING
      ) {
        throw new GiftRequestNotFoundException(params.requestId);
      }
      const targetRequest = requestRows[0];

      // Luồng `/transactions` cũ có thể đã tạo sẵn một lượt cho đúng cặp
      // bài–người nhận này. Khoá nó TRƯỚC `posts`.
      const transactionRows = await manager.query<
        { global_id: string; status: string; quantity: string }[]
      >(
        `SELECT global_id, status, quantity FROM gift_transactions
         WHERE post_id = $1 AND receiver_id = $2
           AND status IN ('REQUESTED', 'ACCEPTED', 'DELIVERING')
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
      const newPostStatus = newRemaining === 0 ? 'DELIVERING' : 'PUBLISHED';

      await manager.query(
        `UPDATE posts SET remaining_quantity = $1, status = $2, updated_at = now() WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1, updated_at = now() WHERE global_id = $2`,
        [GiftRequestStatuses.ACCEPTED, params.requestId],
      );

      if (newRemaining === 0) {
        await manager.query(
          `UPDATE gift_requests SET status = $1, updated_at = now() WHERE post_id = $2 AND global_id != $3 AND status = $4`,
          [
            GiftRequestStatuses.REJECTED,
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

      return { transactionId: params.transactionId };
    });
  }
}
