import { IPostMediaRepository } from '@/domain/ports/repository';
import { PostMediaEntity } from '@/infrastructure/entity';
import { IPostMediaEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';
import { lockEditablePost } from './lock-editable-post';

const MaxPostMedia = 10;

@Injectable()
export class PostMediaRepository
  extends Repository<IPostMediaEntity>
  implements IPostMediaRepository
{
  public constructor(
    @Inject(IPostMediaEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async listByPostId(postId: string): Promise<IPostMediaEntity[]> {
    return this.find({ where: { postId }, order: { sortOrder: 'ASC' } });
  }

  public async listByPostIds(postIds: string[]): Promise<IPostMediaEntity[]> {
    if (postIds.length === 0) return [];
    return this.find({
      where: { postId: In(postIds) },
      order: { postId: 'ASC', sortOrder: 'ASC' },
    });
  }

  public async countByPostId(postId: string): Promise<number> {
    return this.count({ where: { postId } });
  }

  public async removeByPostId(
    postId: string,
    mediaId: number,
  ): Promise<string | null> {
    return this.manager.transaction(async (manager) => {
      await lockEditablePost(manager, postId);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        postId,
      ]);

      // Đọc key TRƯỚC khi xoá: sau lệnh DELETE thì không còn gì nói object nào
      // thuộc bản ghi này.
      const doomed = await manager.findOne(PostMediaEntity, {
        where: { id: mediaId, postId },
      });

      const result = await manager.delete(PostMediaEntity, {
        id: mediaId,
        postId,
      });
      if (result.affected !== 1) return null;

      await manager.query(
        `
          WITH ordered AS (
            SELECT id, row_number() OVER (ORDER BY sort_order) - 1 AS next_order
            FROM post_media
            WHERE post_id = $1
          )
          UPDATE post_media media
          SET sort_order = ordered.next_order + 1000
          FROM ordered
          WHERE media.id = ordered.id
        `,
        [postId],
      );
      await manager
        .createQueryBuilder()
        .update(PostMediaEntity)
        .set({ sortOrder: () => 'sort_order - 1000' })
        .where('post_id = :postId', { postId })
        .execute();

      return doomed?.r2Key ?? null;
    });
  }

  public async replaceOrder(
    postId: string,
    mediaIds: number[],
  ): Promise<IPostMediaEntity[] | null> {
    return this.manager.transaction(async (manager) => {
      await lockEditablePost(manager, postId);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        postId,
      ]);

      const media = await manager.find(PostMediaEntity, {
        where: { postId },
        order: { sortOrder: 'ASC' },
      });
      if (
        mediaIds.length !== media.length ||
        new Set(mediaIds).size !== mediaIds.length ||
        !media.every((item) => mediaIds.includes(item.id))
      )
        return null;

      await manager
        .createQueryBuilder()
        .update(PostMediaEntity)
        .set({ sortOrder: () => 'sort_order + 1000' })
        .where('post_id = :postId', { postId })
        .execute();

      for (const [sortOrder, id] of mediaIds.entries()) {
        await manager.update(PostMediaEntity, { id, postId }, { sortOrder });
      }

      return manager.find(PostMediaEntity, {
        where: { postId },
        order: { sortOrder: 'ASC' },
      });
    });
  }

  public async attach(
    postId: string,
    r2Key: string,
  ): Promise<IPostMediaEntity | null> {
    return this.manager.transaction(async (manager) => {
      await lockEditablePost(manager, postId);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        postId,
      ]);

      const existing = await manager.findOneBy(PostMediaEntity, {
        postId,
        r2Key,
      });
      if (existing) return existing;

      const count = await manager.count(PostMediaEntity, { where: { postId } });
      if (count >= MaxPostMedia) return null;

      const media = manager.create(PostMediaEntity, {
        postId,
        r2Key,
        sortOrder: count,
      });
      return manager.save(media);
    });
  }
}
