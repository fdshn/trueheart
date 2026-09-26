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

export interface ICountPendingAdminCommentsCommand {
  actorUserId: string;
}

export interface ICountPendingAdminCommentsResult {
  /** Số bình luận đang chờ Admin xử — con số cho huy hiệu trên menu CMS. */
  pendingComments: number;
}

export interface ICountPendingAdminCommentsUseCase extends IUseCase<
  ICountPendingAdminCommentsCommand,
  ICountPendingAdminCommentsResult
> {}

export const ICountPendingAdminCommentsUseCase = Symbol(
  'ICountPendingAdminCommentsUseCase',
);
