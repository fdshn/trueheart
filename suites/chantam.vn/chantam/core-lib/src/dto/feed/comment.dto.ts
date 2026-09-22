import { CommentStatuses, ContentSubjectTypes } from '../../consts';

export interface IContentCommentDto {
  commentId: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  authorFullName: string | null;
  /**
   * Rỗng khi bình luận đã bị gỡ hoặc bị ẩn.
   *
   * Dòng vẫn còn để chuỗi trả lời bên dưới không mất ngữ cảnh, nhưng nội dung
   * thì không trả ra nữa — giao diện đọc `status` để hiện "bình luận đã bị gỡ".
   */
  body: string;
  status: CommentStatuses;
  replyCount: number;
  reactionCount: number;
  isMine: boolean;
  editedAt: Date | null;
  createdAt: Date;
}

/** Cùng hình dạng với cửa sổ tin nhắn chat — cùng kiểu con trỏ, cùng cách đọc. */
export interface IContentCommentWindowDto {
  limit: number;
  oldestCursor: string | null;
  newestCursor: string | null;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface IListCommentsResponseDto {
  comments: IContentCommentDto[];
  window: IContentCommentWindowDto;
}

export interface ICreateCommentBodyDto {
  comment: {
    body: string;
    /** Có giá trị thì đây là TRẢ LỜI. Chỉ trả lời được bình luận gốc. */
    parentId?: string;
  };
}

export interface ICommentResponseDto {
  comment: IContentCommentDto;
}

export interface IContentSubjectDto {
  subjectType: ContentSubjectTypes;
  subjectId: string;
}
