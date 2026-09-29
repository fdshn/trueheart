import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
} from '../exceptions';

export function assertEditablePost(post: IPostEntity): void {
  if (post.status === 'RESERVED') throw new PostHasLiveTransactionException();
  if (
    !['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'].includes(post.status) ||
    (post.expiresAt !== null && post.expiresAt <= new Date())
  )
    throw new PostInvalidStateException();
}
