import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IGiftRequestEntity } from '@chantam.vn/chantam.core-lib/entities';

export function toGiftRequestDto(entity: IGiftRequestEntity): IGiftRequestDto {
  return {
    id: entity.globalId,
    postId: entity.postId,
    requesterId: entity.requesterId,
    message: entity.message,
    status: entity.status,
    queueJoinedAt: entity.queueJoinedAt,
    withdrawnAt: entity.withdrawnAt ?? null,
    offeringPostId: entity.offeringPostId ?? null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
