import {
  GiftRequestNotFoundException,
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

  public async acceptRequest(params: {
    requestId: string;
    postId: string;
    giverId: string;
    transactionId: string;
  }): Promise<{ transactionId: string }> {
    return this.manager.transaction(async (manager) => {
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
        throw new ForbiddenException(
          'Chỉ người đăng bài mới có quyền duyệt người xin nhận',
        );
      }

      if (post.status !== GiftPostStatuses.PUBLISHED) {
        throw new PostInvalidStateException();
      }

      if (Number(post.remaining_quantity) < 1) {
        throw new GiftTransactionOutOfStockException();
      }

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

      const newRemaining = Number(post.remaining_quantity) - 1;
      const newPostStatus = newRemaining === 0 ? 'DELIVERING' : 'PUBLISHED';

      await manager.query(
        `UPDATE posts SET remaining_quantity = $1, status = $2 WHERE global_id = $3`,
        [newRemaining, newPostStatus, params.postId],
      );

      await manager.query(
        `UPDATE gift_requests SET status = $1 WHERE global_id = $2`,
        [GiftRequestStatuses.ACCEPTED, params.requestId],
      );

      if (newRemaining === 0) {
        await manager.query(
          `UPDATE gift_requests SET status = $1 WHERE post_id = $2 AND global_id != $3 AND status = $4`,
          [
            GiftRequestStatuses.REJECTED,
            params.postId,
            params.requestId,
            GiftRequestStatuses.PENDING,
          ],
        );
      }

      let finalTransactionId = params.transactionId;
      const existingTx = await manager.query<{ global_id: string }[]>(
        `SELECT global_id FROM gift_transactions WHERE post_id = $1 AND receiver_id = $2 AND status IN ('REQUESTED', 'ACCEPTED', 'DELIVERING')`,
        [params.postId, targetRequest.requester_id],
      );

      if (existingTx && existingTx.length > 0) {
        finalTransactionId = existingTx[0].global_id;
        await manager.query(
          `UPDATE gift_transactions SET status = 'ACCEPTED', accepted_at = now() WHERE global_id = $1`,
          [finalTransactionId],
        );
      } else {
        await manager.query(
          `INSERT INTO gift_transactions (global_id, post_id, giver_id, receiver_id, quantity, status, accepted_at) VALUES ($1, $2, $3, $4, 1, 'ACCEPTED', now())`,
          [
            finalTransactionId,
            params.postId,
            params.giverId,
            targetRequest.requester_id,
          ],
        );
      }

      return { transactionId: finalTransactionId };
    });
  }
}
