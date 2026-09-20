import { GiftRequestStatuses } from '../consts';

export interface IGiftRequest {
  postId: string;
  requesterId: string;
  message: string;
  status: GiftRequestStatuses;
  queueJoinedAt: Date;
  withdrawnAt: Date | null;
}
