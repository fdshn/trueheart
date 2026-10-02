import {
  IBlogPage,
  IBlogRecord,
  IBlogRepository,
  IBlogSummary,
  IBlogWriteParams,
  IListBlogsQuery,
  IUpdateBlogParams,
} from '@/domain/ports/repository';
import { BlogCategory } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  title: string;
  slug: string;
  category: string;
  summary: string | null;
  content_html: string;
  thumbnail_url: string | null;
  author_id: string | null;
  view_count: string | number;
  is_published: boolean;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const FullColumns = `global_id, title, slug, category, summary, content_html,
       thumbnail_url, author_id, view_count, is_published, published_at,
       created_at, updated_at`;

/**
 * Cột cho danh sách — KHÔNG có `content_html`.
 *
 * Một trang 20 bài × 200KB nội dung là 4MB kéo về cho một màn hình chỉ hiện tiêu đề và
 * tóm tắt. `author_id` cũng bỏ: danh sách công khai không cần, và CMS tra tác giả ở trang
 * chi tiết.
 */
const SummaryColumns = `global_id, title, slug, category, summary, thumbnail_url,
       view_count, is_published, published_at, created_at, updated_at`;

function toRecord(row: IRow): IBlogRecord {
  return {
    globalId: row.global_id,
    title: row.title,
    slug: row.slug,
    category: row.category as BlogCategory,
    summary: row.summary,
    contentHtml: row.content_html,
    thumbnailUrl: row.thumbnail_url,
    authorId: row.author_id,
    // `int` của Postgres về đây là number, nhưng `count(*)` và `bigint` về dạng chuỗi —
    // `Number()` cho cả hai để không bao giờ trả một chuỗi ra API.
    viewCount: Number(row.view_count),
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(
  row: Omit<IRow, 'content_html' | 'author_id'>,
): IBlogSummary {
  return {
    globalId: row.global_id,
    title: row.title,
    slug: row.slug,
    category: row.category as BlogCategory,
    summary: row.summary,
    thumbnailUrl: row.thumbnail_url,
    viewCount: Number(row.view_count),
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class BlogRepository implements IBlogRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async listBlogs(query: IListBlogsQuery): Promise<IBlogPage> {
    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (query.publishedOnly) conditions.push('is_published');
    if (query.category) {
      params.push(query.category);
      conditions.push(`category = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    // Bài đã xuất bản sắp theo `published_at`; bản nháp chưa có mốc đó nên dùng
    // `created_at` làm dự phòng. Thiếu `COALESCE` thì mọi bản nháp dồn xuống cuối với
    // `NULL`, và Admin vừa lưu nháp xong không thấy nó ở đâu.
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${SummaryColumns} FROM blogs
        WHERE ${where}
        ORDER BY COALESCE(published_at, created_at) DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM blogs WHERE ${where}`,
      params,
    );

    return {
      items: (rows ?? []).map(toSummary),
      total: Number(counted?.total ?? 0),
    };
  }

  public async findByGlobalId(globalId: string): Promise<IBlogRecord | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${FullColumns} FROM blogs
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [globalId],
    );
    return row ? toRecord(row) : null;
  }

  public async findPublishedBySlug(slug: string): Promise<IBlogRecord | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${FullColumns} FROM blogs
        WHERE slug = $1 AND is_published AND deleted_at IS NULL`,
      [slug],
    );
    return row ? toRecord(row) : null;
  }

  /**
   * Slug đã có người dùng chưa.
   *
   * Tính CẢ bài đã xoá mềm: cột là `UNIQUE` trên toàn bảng, không có điều kiện
   * `deleted_at IS NULL`. Bỏ qua dòng đã xoá ở đây sẽ báo "slug còn trống" rồi `INSERT`
   * đụng khoá — một lỗi 500 thay cho một thông báo đọc được.
   */
  public async slugTaken(
    slug: string,
    exceptGlobalId?: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM blogs
          WHERE slug = $1 AND ($2::uuid IS NULL OR global_id <> $2::uuid)
       ) AS exists`,
      [slug, exceptGlobalId ?? null],
    );
    return row?.exists === true;
  }

  public async createBlog(params: IBlogWriteParams): Promise<IBlogRecord> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]`.
    //
    // `published_at` do SQL quyết định, không do tầng ứng dụng truyền xuống: ràng buộc
    // `CHK_blogs_published_at` buộc hai cột khớp nhau, và để mã nguồn tự tính mốc đó là
    // mời một lượt quên.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO blogs
         (title, slug, category, summary, content_html, thumbnail_url,
          author_id, is_published, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $8 THEN now() ELSE NULL END)
       RETURNING ${FullColumns}`,
      [
        params.title,
        params.slug,
        params.category,
        params.summary,
        params.contentHtml,
        params.thumbnailUrl,
        params.actorUserId,
        params.isPublished,
      ],
    );
    return toRecord(row);
  }

  public async updateBlog(params: IUpdateBlogParams): Promise<IBlogRecord> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE blogs
          SET title = $2,
              slug = $3,
              category = $4,
              summary = $5,
              content_html = $6,
              thumbnail_url = $7,
              is_published = $8,
              -- Giữ mốc xuất bản CŨ nếu bài vẫn đang công khai: sửa một typo không được
              -- đẩy bài lên đầu danh sách như mới. Rút xuống rồi đăng lại thì có mốc mới.
              published_at = CASE
                WHEN $8 AND published_at IS NOT NULL THEN published_at
                WHEN $8 THEN now()
                ELSE NULL
              END,
              updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${FullColumns}`,
      [
        params.globalId,
        params.title,
        params.slug,
        params.category,
        params.summary,
        params.contentHtml,
        params.thumbnailUrl,
        params.isPublished,
      ],
    );
    return toRecord(rows[0]);
  }

  public async softDeleteBlog(
    globalId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE blogs
          SET deleted_at = now(), is_published = false, published_at = NULL,
              updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [globalId],
    );
    // `actorUserId` nhận vào để chữ ký nói đúng việc (ai xoá), dù bảng chưa có cột
    // `deleted_by`. Thêm cột đó là việc của lượt cần truy vết người xoá.
    void actorUserId;
    return rows.length > 0;
  }

  public async incrementViewCount(globalId: string): Promise<void> {
    await this.manager.query(
      `UPDATE blogs SET view_count = view_count + 1
        WHERE global_id = $1 AND is_published AND deleted_at IS NULL`,
      [globalId],
    );
  }
}
