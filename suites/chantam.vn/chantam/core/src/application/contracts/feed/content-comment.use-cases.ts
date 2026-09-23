import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ICommentResponseDto,
  IListCommentsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateCommentCommand {
  userId: string;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  /** Có thể rỗng khi có ảnh — một bình luận chỉ có ảnh là hợp lệ. */
  body: string;
  parentId?: string;
  /** Key ảnh đã tải lên, tối đa 3. */
  mediaKeys?: string[];
}

export type ICreateCommentResult = ICommentResponseDto;

export interface ICreateCommentUseCase extends IUseCase<
  ICreateCommentCommand,
  ICreateCommentResult
> {}

export const ICreateCommentUseCase = Symbol('ICreateCommentUseCase');

export interface IEditCommentCommand {
  userId: string;
  commentId: string;
  body: string;
}

export type IEditCommentResult = ICommentResponseDto;

export interface IEditCommentUseCase extends IUseCase<
  IEditCommentCommand,
  IEditCommentResult
> {}

export const IEditCommentUseCase = Symbol('IEditCommentUseCase');

export interface IRemoveCommentCommand {
  userId: string;
  commentId: string;
}

export type IRemoveCommentResult = ICommentResponseDto;

export interface IRemoveCommentUseCase extends IUseCase<
  IRemoveCommentCommand,
  IRemoveCommentResult
> {}

export const IRemoveCommentUseCase = Symbol('IRemoveCommentUseCase');

export interface IListCommentsCommand {
  /** `null` khi gọi ẩn danh. Có giá trị thì tác giả thấy bình luận chờ duyệt của mình. */
  viewerId: string | null;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  limit?: number;
  before?: string;
}

export type IListCommentsResult = IListCommentsResponseDto;

export interface IListCommentsUseCase extends IUseCase<
  IListCommentsCommand,
  IListCommentsResult
> {}

export const IListCommentsUseCase = Symbol('IListCommentsUseCase');

export interface IListCommentRepliesCommand {
  viewerId: string | null;
  commentId: string;
  limit?: number;
  after?: string;
}

export type IListCommentRepliesResult = IListCommentsResponseDto;

export interface IListCommentRepliesUseCase extends IUseCase<
  IListCommentRepliesCommand,
  IListCommentRepliesResult
> {}

export const IListCommentRepliesUseCase = Symbol('IListCommentRepliesUseCase');

export interface IRequestCommentMediaUploadCommand {
  userId: string;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  contentType: string;
  contentLength: number;
}

export interface IRequestCommentMediaUploadResult {
  upload: {
    key: string;
    uploadUrl: string;
    expiresInSeconds: number;
    publicUrl: string;
  };
}

export interface IRequestCommentMediaUploadUseCase extends IUseCase<
  IRequestCommentMediaUploadCommand,
  IRequestCommentMediaUploadResult
> {}

export const IRequestCommentMediaUploadUseCase = Symbol(
  'IRequestCommentMediaUploadUseCase',
);
