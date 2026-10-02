import { BlogCategory } from '@chantam.vn/chantam.core-lib/models';

export interface IBlogRecord {
  globalId: string;
  title: string;
  slug: string;
  category: BlogCategory;
  summary: string | null;
  contentHtml: string;
  thumbnailUrl: string | null;
  authorId: string | null;
  viewCount: number;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Bản rút gọn cho danh sách — KHÔNG mang `contentHtml`. */
export interface IBlogSummary extends Omit<
  IBlogRecord,
  'contentHtml' | 'authorId'
> {}

export interface IBlogWriteParams {
  actorUserId: string;
  title: string;
  slug: string;
  category: BlogCategory;
  summary: string | null;
  contentHtml: string;
  thumbnailUrl: string | null;
  isPublished: boolean;
}

export interface IUpdateBlogParams extends IBlogWriteParams {
  globalId: string;
}

export interface IBlogPage {
  items: IBlogSummary[];
  total: number;
}

export interface IListBlogsQuery {
  limit: number;
  offset: number;
  category?: BlogCategory;
  /** `true` chỉ lấy bài đã xuất bản — đường công khai luôn truyền `true`. */
  publishedOnly: boolean;
}

export interface IBlogRepository {
  /**
   * Danh sách.
   *
   * KHÔNG trả `contentHtml`: một trang 20 bài × 200KB nội dung là 4MB cho một màn hình
   * chỉ hiện tiêu đề và tóm tắt.
   */
  listBlogs(query: IListBlogsQuery): Promise<IBlogPage>;
  findByGlobalId(globalId: string): Promise<IBlogRecord | null>;
  /** Đường công khai tra theo `slug`; chỉ trả bài đã xuất bản. */
  findPublishedBySlug(slug: string): Promise<IBlogRecord | null>;
  /** `true` khi slug đã có người dùng (bỏ qua chính bài đang sửa). */
  slugTaken(slug: string, exceptGlobalId?: string): Promise<boolean>;
  createBlog(params: IBlogWriteParams): Promise<IBlogRecord>;
  updateBlog(params: IUpdateBlogParams): Promise<IBlogRecord>;
  /** Xoá MỀM — `deleted_at`. Bài đã xuất bản còn link ngoài trỏ vào. */
  softDeleteBlog(globalId: string, actorUserId: string): Promise<boolean>;
  /**
   * Tăng lượt xem.
   *
   * Tách khỏi `findPublishedBySlug` để đường đọc không phải nằm trong transaction ghi, và
   * KHÔNG đụng `updated_at`: nếu đụng thì mọi bài đọc nhiều sẽ luôn hiện "vừa cập nhật".
   */
  incrementViewCount(globalId: string): Promise<void>;
}

export const IBlogRepository = Symbol('IBlogRepository');
