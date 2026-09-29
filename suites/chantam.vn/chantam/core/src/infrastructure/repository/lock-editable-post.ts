import { assertEditablePost } from '@/domain/consts/post-edit-policy';
import {
  PostHasLiveTransactionException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { PostEntity } from '@/infrastructure/entity/post.entity';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { EntityManager } from 'typeorm';

/**
 * Same post-row lock as stock allocation. REQUESTED transactions do not block
 * editing; ACCEPTED/DELIVERING transactions do, even if the post still has
 * available stock. (Those two are TRANSACTION statuses — the post itself only
 * ever reads RESERVED, xem migration 1795200000000.)
 */
export async function lockEditablePost(
  manager: EntityManager,
  postId: string,
  authorId?: string,
): Promise<PostEntity> {
  const post = await manager.findOne(PostEntity, {
    where: { globalId: postId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!post || post.deletedAt) throw new PostNotFoundException(postId);
  if (authorId !== undefined && post.authorId !== authorId)
    throw new ForbiddenException();
  const [live] = await manager.query<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM gift_transactions
       WHERE post_id = $1 AND status IN ('ACCEPTED', 'DELIVERING')
     ) AS exists`,
    [postId],
  );
  if (live.exists || post.status === 'RESERVED')
    throw new PostHasLiveTransactionException();
  assertEditablePost(post);
  return post;
}
