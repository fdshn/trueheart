import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IKeysetCursor } from '@chantam.vn/chantam.core-lib/models';

export interface IContentComment {
  readonly globalId: string;
  readonly subjectType: ContentSubjectTypes;
  readonly subjectId: string;
  readonly authorId: string;
  readonly authorUsername: string;
  readonly authorFullName: string | null;
  readonly body: string;
  readonly status: CommentStatuses;
  readonly depth: number;
  readonly parentId: string | null;
  readonly replyCount: number;
  readonly reactionCount: number;
  /** Key ảnh đính kèm, xếp theo slot. Rỗng khi bình luận chỉ có chữ. */
  readonly mediaKeys: string[];
  readonly editedAt: Date | null;
  readonly createdAt: Date;
  /** Có dùng để dựng con trỏ, không lộ ra API. */
  readonly id: number;
}

export interface ICreateCommentParams {
  readonly globalId: string;
  readonly subjectType: ContentSubjectTypes;
  readonly subjectId: string;
  readonly authorId: string;
  readonly body: string;
  readonly status: CommentStatuses;
  /** Mục cấm đã khớp, để Admin biết vì sao bình luận này bị giữ lại. */
  readonly flaggedTerms: string | null;
  readonly parentId: string | null;
  /**
   * Ảnh đính kèm, tối đa 3.
   *
   * Ghi trong CÙNG transaction với bình luận: `media_count` nằm trên chính dòng
   * bình luận và phục vụ ràng buộc "không được vừa rỗng chữ vừa không ảnh", nên
   * nó phải đúng ngay từ lúc chèn.
   */
  readonly mediaKeys: readonly string[];
}

export interface ICommentPage {
  readonly items: IContentComment[];
  readonly hasMoreBefore: boolean;
}

export interface IContentCommentRepository {
  /**
   * Ghi một bình luận và cập nhật số đếm trong **cùng transaction**.
   *
   * Chỉ bình luận `VISIBLE` được tính vào số đếm công khai. Một bình luận đang
   * chờ Admin xem mà đã cộng vào con số người ngoài nhìn thấy thì con số đó nói
   * dối — người ta bấm vào và thấy ít hơn.
   */
  create(params: ICreateCommentParams): Promise<IContentComment>;
  findByGlobalId(globalId: string): Promise<IContentComment | null>;
  /**
   * Bình luận gốc của một chủ thể, mới nhất trước, phân trang bằng con trỏ.
   *
   * Cùng lý do với chat: bình luận được thêm vào ĐẦU, nên OFFSET trôi theo mỗi
   * bình luận mới và cửa sổ sau sẽ lặp lại thứ người dùng vừa đọc.
   */
  listRoots(params: {
    subjectType: ContentSubjectTypes;
    subjectId: string;
    limit: number;
    before?: IKeysetCursor | null;
    /** Tác giả thấy bình luận đang chờ duyệt CỦA CHÍNH MÌNH. */
    viewerId?: string | null;
  }): Promise<ICommentPage>;
  /**
   * Trả lời của một bình luận, **cũ nhất trước**.
   *
   * Ngược chiều với danh sách gốc, và cố ý: một cuộc trao đổi đọc từ trên
   * xuống mới hiểu được, còn danh sách bài thì cần thứ mới nhất lên đầu.
   */
  listReplies(params: {
    parentId: string;
    limit: number;
    after?: IKeysetCursor | null;
    viewerId?: string | null;
  }): Promise<{ items: IContentComment[]; hasMoreAfter: boolean }>;
  /** Sửa nội dung. Cửa sổ thời gian và quyền do use case kiểm. */
  updateBody(params: {
    globalId: string;
    body: string;
    status: CommentStatuses;
    flaggedTerms: string | null;
  }): Promise<IContentComment>;
  /** Gỡ: đổi trạng thái, KHÔNG xoá dòng — chuỗi trả lời bên dưới cần giữ ngữ cảnh. */
  markStatus(params: {
    globalId: string;
    status: CommentStatuses;
  }): Promise<IContentComment>;

  /**
   * Hàng đợi kiểm duyệt bình luận cho Admin.
   *
   * Bình luận bị bộ lọc từ ngữ giữ lại nằm ở `PENDING_REVIEW` và **ẩn khỏi công
   * khai**. Không có hàng đợi thì nó nằm đó vĩnh viễn: người viết tưởng mình đã
   * đăng, người đọc không thấy gì, và không ai được nhắc là có thứ đang chờ.
   *
   * Kèm `subjectTitle` để Admin quyết ngay trên danh sách — một câu chửi chỉ có
   * nghĩa khi biết nó nằm dưới bài nào.
   */
  findForAdmin(params: {
    status?: CommentStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IAdminComment[]; total: number }>;
}

export interface IAdminComment {
  readonly commentId: string;
  readonly subjectType: ContentSubjectTypes;
  readonly subjectId: string;
  readonly subjectTitle: string | null;
  readonly authorId: string;
  readonly authorUsername: string;
  readonly body: string;
  readonly status: CommentStatuses;
  /** Từ ngữ mà bộ lọc bắt được — lý do nó nằm trong hàng đợi. */
  readonly flaggedTerms: string | null;
  readonly createdAt: Date;
}

export const IContentCommentRepository = Symbol('IContentCommentRepository');
