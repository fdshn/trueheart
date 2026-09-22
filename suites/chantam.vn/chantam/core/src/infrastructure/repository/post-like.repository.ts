import { IPostLikeRepository } from '@/domain/ports/repository';
import { IPostLikeEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';
import { updateReturning } from './update-returning';

@Injectable()
export class PostLikeRepository
  extends Repository<IPostLikeEntity>
  implements IPostLikeRepository
{
  public constructor(
    @Inject(IPostLikeEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async like(
    userId: string,
    postId: string,
  ): Promise<IPostLikeEntity | null> {
    return this.manager.transaction(async (manager) => {
      const inserted = await manager.query<
        { id: string; user_id: string; post_id: string; created_at: Date }[]
      >(
        `
          INSERT INTO post_likes (user_id, post_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT ON CONSTRAINT "UQ_post_likes_user_post" DO NOTHING
          RETURNING id, user_id, post_id, created_at
        `,
        [userId, postId],
      );

      if (!inserted || inserted.length === 0) {
        return null;
      }

      await manager.query(
        `
          UPDATE posts
          SET like_count = like_count + 1
          WHERE global_id = $1 AND deleted_at IS NULL
        `,
        [postId],
      );

      const row = inserted[0];
      return {
        id: Number(row.id),
        userId: row.user_id,
        postId: row.post_id,
        createdAt: row.created_at,
      };
    });
  }

  public async unlike(userId: string, postId: string): Promise<boolean> {
    return this.manager.transaction(async (manager) => {
      const deleted = await updateReturning<{ id: string }>(
        manager,
        `
          DELETE FROM post_likes
          WHERE user_id = $1 AND post_id = $2
          RETURNING id
        `,
        [userId, postId],
      );

      if (!deleted || deleted.length === 0) {
        return false;
      }

      await manager.query(
        `
          UPDATE posts
          SET like_count = GREATEST(like_count - 1, 0)
          WHERE global_id = $1 AND deleted_at IS NULL
        `,
        [postId],
      );

      return true;
    });
  }

  public async hasLiked(userId: string, postId: string): Promise<boolean> {
    const [row] = await this.manager.query<{ exists: boolean }[]>(
      `
        SELECT EXISTS (
          SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2
        ) AS exists
      `,
      [userId, postId],
    );

    return Boolean(row?.exists);
  }

  public async findLikedPostIds(
    userId: string,
    postIds: string[],
  ): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const rows = await this.manager.query<{ post_id: string }[]>(
      `
        SELECT post_id
        FROM post_likes
        WHERE user_id = $1 AND post_id = ANY($2::uuid[])
      `,
      [userId, postIds],
    );

    return new Set(rows.map((r) => r.post_id));
  }
}
