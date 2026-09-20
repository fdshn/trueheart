import { IAdminPostSummary } from '@/domain/ports/repository';
import { GiftPostStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IModerateAdminPostDto {
  decision: GiftPostStatuses.PUBLISHED | GiftPostStatuses.REJECTED;
  reason: string;
}

export interface IModerateAdminPostCommand {
  actorUserId: string;
  postId: string;
  moderation: IModerateAdminPostDto;
}

export interface IModerateAdminPostResult {
  post: IAdminPostSummary;
}

export interface IModerateAdminPostUseCase extends IUseCase<
  IModerateAdminPostCommand,
  IModerateAdminPostResult
> {}

export const IModerateAdminPostUseCase = Symbol('IModerateAdminPostUseCase');
