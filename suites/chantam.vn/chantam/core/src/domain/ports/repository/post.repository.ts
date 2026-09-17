import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IPostRepository extends Repository<IPostEntity> {
  createOfferWithinQuota(
    authorId: string,
    quota: number,
    post: Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean>;
  transitionPendingReview(
    postId: string,
    status: 'PUBLISHED' | 'REJECTED',
    expiresAt: Date | null,
  ): Promise<IPostEntity | null>;
  findPublicByGlobalId(globalId: string): Promise<IPostEntity | null>;
}

export const IPostRepository = Symbol('IPostRepository');
