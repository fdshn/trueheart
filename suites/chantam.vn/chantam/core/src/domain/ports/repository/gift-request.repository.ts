import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IPostRequestItemDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IGiftRequestRepository extends Repository<IGiftRequestEntity> {
  findByPostAndRequester(
    postId: string,
    requesterId: string,
  ): Promise<IGiftRequestEntity | null>;

  countActiveByPostIds(postIds: string[]): Promise<Map<string, number>>;

  findStatusesByPostIdsAndRequester(
    postIds: string[],
    requesterId: string,
  ): Promise<Map<string, GiftRequestStatuses>>;

  listByPostId(postId: string): Promise<IPostRequestItemDto[]>;

  acceptRequest(params: {
    requestId: string;
    postId: string;
    giverId: string;
    transactionId: string;
  }): Promise<{ transactionId: string }>;
}

export const IGiftRequestRepository = Symbol('IGiftRequestRepository');
