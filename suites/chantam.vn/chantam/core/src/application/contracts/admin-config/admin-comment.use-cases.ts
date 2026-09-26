import { IAdminComment } from '@/domain/ports/repository';
import { CommentStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IListAdminCommentsCommand {
  actorUserId: string;
  /** Bỏ trống thì trả mọi bình luận chưa bị gỡ. */
  status?: CommentStatuses;
  page: number;
  pageSize: number;
}

export interface IListAdminCommentsResult {
  comments: IAdminComment[];
  meta: IPaginationMetaDto;
}

export interface IListAdminCommentsUseCase extends IUseCase<
  IListAdminCommentsCommand,
  IListAdminCommentsResult
> {}

export const IListAdminCommentsUseCase = Symbol('IListAdminCommentsUseCase');

export interface IModerateAdminCommentDto {
  /** `VISIBLE` cho hiện lại, `REMOVED` để gỡ hẳn. */
  decision: CommentStatuses.VISIBLE | CommentStatuses.REMOVED;
  reason: string;
}

export interface IModerateAdminCommentCommand {
  actorUserId: string;
  commentId: string;
  moderation: IModerateAdminCommentDto;
}

export interface IModerateAdminCommentResult {
  comment: IAdminComment;
}

export interface IModerateAdminCommentUseCase extends IUseCase<
  IModerateAdminCommentCommand,
  IModerateAdminCommentResult
> {}

export const IModerateAdminCommentUseCase = Symbol(
  'IModerateAdminCommentUseCase',
);
