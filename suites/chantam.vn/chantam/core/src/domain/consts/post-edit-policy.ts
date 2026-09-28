import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
} from '../exceptions';

export function assertEditablePost(post: IPostEntity): void {
  if (['RESERVED', 'DELIVERING'].includes(post.status))
    throw new PostHasLiveTransactionException();
  if (
    !['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'].includes(post.status) ||
    (post.expiresAt !== null && post.expiresAt <= new Date())
  )
    throw new PostInvalidStateException();
}
