import { IPostRepository } from '@/domain/ports/repository';
import { PostEntity } from '@/infrastructure/entity';
import { PubliclyVisibleGiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
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
