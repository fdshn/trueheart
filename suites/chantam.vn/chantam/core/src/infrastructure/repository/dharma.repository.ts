import {
  ICreateDharmaContentParams,
  IDharmaContent,
  IDharmaContentPage,
  IDharmaContentSummary,
  IDharmaRecitation,
  IDharmaRepository,
  IWriteDharmaContentParams,
} from '@/domain/ports/repository';
import { DharmaContentType } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  content_type: string;
  category: string | null;
  title: string;
  slug: string;
  summary: string | null;
  body_text: string;
  audio_url: string | null;
  cover_url: string | null;
  display_order: string | number;
  is_featured: boolean;
  is_published: boolean;
  published_at: Date | null;
  view_count: string | number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface IRecitationRow {
  global_id: string;
  content_id: string;
  user_id: string;
  started_at: Date;
  completed_at: Date | null;
  duration_seconds: string | number | null;
}

const FullColumns = `global_id, content_type, category, title, slug, summary, body_text,
       audio_url, cover_url, display_order, is_featured, is_published, published_at,
       view_count, created_by, created_at, updated_at`;

/**
 * Cột cho DANH SÁCH — KHÔNG có `body_text`.
 *
 * Một bộ kinh tới 2 triệu ký tự; một trang 20 hàng mang cả nội dung là 40MB kéo về cho một
 * màn hình chỉ hiện tiêu đề. Đây không phải tối ưu sớm — đó là khác biệt giữa một trang mở
 * được và một trang không.
 */
const SummaryColumns = `global_id, content_type, category, title, slug, summary,
       audio_url, cover_url, display_order, is_featured, is_published, published_at,
       view_count, created_by, created_at, updated_at`;

const RecitationColumns = `global_id, content_id, user_id, started_at, completed_at,
       duration_seconds`;

function toSummary(row: Omit<IRow, 'body_text'>): IDharmaContentSummary {
  return {
    globalId: row.global_id,
    contentType: row.content_type as DharmaContentType,
    category: row.category,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    displayOrder: Number(row.display_order),
    isFeatured: row.is_featured,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    viewCount: Number(row.view_count),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toContent(row: IRow): IDharmaContent {
  return { ...toSummary(row), bodyText: row.body_text };
}

function toRecitation(row: IRecitationRow): IDharmaRecitation {
  return {
    globalId: row.global_id,
    contentId: row.content_id,
    userId: row.user_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
  };
}

/** Khoá DTO -> cột cho câu `UPDATE` dựng động. */
const UpdatableColumns: Readonly<
  Record<keyof Omit<IWriteDharmaContentParams, 'isPublished'>, string>
> = {
  contentType: 'content_type',
  category: 'category',
  title: 'title',
  slug: 'slug',
  summary: 'summary',
  bodyText: 'body_text',
  audioUrl: 'audio_url',
  coverUrl: 'cover_url',
  displayOrder: 'display_order',
  isFeatured: 'is_featured',
};

@Injectable()
export class DharmaRepository implements IDharmaRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async createContent(
    params: ICreateDharmaContentParams,
  ): Promise<IDharmaContent> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]`.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO dharma_contents
         (content_type, category, title, slug, summary, body_text, audio_url, cover_url,
          display_order, is_featured, is_published, published_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $12 THEN now() ELSE NULL END, $13)
       RETURNING ${FullColumns}`,
      [
        params.contentType,
        params.category,
        params.title,
        params.slug,
        params.summary,
        params.bodyText,
        params.audioUrl,
        params.coverUrl,
        params.displayOrder,
        params.isFeatured,
        params.isPublished,
        // `isPublished` lần hai làm `$12`. Dùng một tham số vừa ở vị trí VALUES (cột
        // `boolean`) vừa trong `CASE WHEN` làm Postgres suy diễn kiểu không nhất quán —
        // cùng lớp lỗi "inconsistent types deduced for parameter" đã gặp ở F47.
        params.isPublished,
        params.createdBy,
      ],
    );
    return toContent(row);
  }

  public async slugTaken(
    slug: string,
    exceptGlobalId?: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ taken: boolean }[]>(
      `SELECT true AS taken FROM dharma_contents
        WHERE slug = $1 AND ($2::uuid IS NULL OR global_id <> $2::uuid)
        LIMIT 1`,
      [slug, exceptGlobalId ?? null],
    );
    return row?.taken === true;
  }

  public async findContentByGlobalId(
    globalId: string,
  ): Promise<IDharmaContent | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${FullColumns} FROM dharma_contents
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [globalId],
    );
    return row ? toContent(row) : null;
  }

  public async findPublishedContentByIdOrSlug(
    idOrSlug: string,
  ): Promise<IDharmaContent | null> {
    // `global_id::text = $1` thay vì nhận dạng UUID ở tầng JS: slug có dạng
    // `^[a-z0-9]+(-[a-z0-9]+)*$` nên không chuỗi nào vừa là UUID hợp lệ vừa là slug hợp lệ,
    // và `::text` tránh lỗi `invalid input syntax for type uuid`.
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${FullColumns} FROM dharma_contents
        WHERE (global_id::text = $1 OR slug = $1)
          AND is_published AND deleted_at IS NULL`,
      [idOrSlug],
    );
    return row ? toContent(row) : null;
  }

  public async listPublishedContents(query: {
    limit: number;
    offset: number;
    contentType?: DharmaContentType;
    category?: string;
    featuredOnly?: boolean;
  }): Promise<IDharmaContentPage> {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.contentType) {
      values.push(query.contentType);
      filters.push(`content_type = $${values.length}`);
    }
    if (query.category) {
      values.push(query.category);
      filters.push(`category = $${values.length}`);
    }
    if (query.featuredOnly) filters.push('is_featured');

    const where = ['is_published', 'deleted_at IS NULL', ...filters].join(
      ' AND ',
    );

    // Câu đếm dùng ĐÚNG bộ lọc và ĐÚNG mảng tham số của câu đọc. Hai bản lọc lệch nhau là
    // người dùng thấy "48 bộ kinh" rồi nhận về 12 hàng.
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_contents WHERE ${where}`,
      values,
    );
    const rows = await this.manager.query<Omit<IRow, 'body_text'>[]>(
      `SELECT ${SummaryColumns} FROM dharma_contents
        WHERE ${where}
        ORDER BY display_order ASC, id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toSummary),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listContentsForAdmin(query: {
    limit: number;
    offset: number;
    contentType?: DharmaContentType;
    includeDrafts: boolean;
  }): Promise<IDharmaContentPage> {
    const filters: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];

    if (!query.includeDrafts) filters.push('is_published');
    if (query.contentType) {
      values.push(query.contentType);
      filters.push(`content_type = $${values.length}`);
    }
    const where = filters.join(' AND ');

    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_contents WHERE ${where}`,
      values,
    );
    // Bản nháp chưa có `published_at`, nên sắp theo nó sẽ dồn mọi nháp xuống cuối với
    // `NULL`. Dùng `COALESCE(published_at, created_at)` để Admin vừa lưu nháp xong thấy nó
    // ngay — cùng lỗi `blogs` đã sửa.
    const rows = await this.manager.query<Omit<IRow, 'body_text'>[]>(
      `SELECT ${SummaryColumns} FROM dharma_contents
        WHERE ${where}
        ORDER BY COALESCE(published_at, created_at) DESC, id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toSummary),
      total: Number(counted?.total ?? 0),
    };
  }

  public async updateContent(params: {
    contentId: string;
    changes: Partial<IWriteDharmaContentParams>;
  }): Promise<IDharmaContent | null> {
    const assignments: string[] = [];
    const values: unknown[] = [params.contentId];

    for (const [key, column] of Object.entries(UpdatableColumns)) {
      const value =
        params.changes[
          key as keyof Omit<IWriteDharmaContentParams, 'isPublished'>
        ];
      if (value === undefined) continue;
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }

    // `is_published` đi kèm `published_at` nên không dùng được vòng lặp trên.
    //
    // GIỮ `published_at` cũ khi bản đã xuất bản được sửa tiếp: `COALESCE(published_at,
    // now())` chỉ đặt mốc ở lượt xuất bản ĐẦU. Ghi `now()` mỗi lượt sửa là đẩy một bộ kinh
    // cũ lên đầu danh sách "mới xuất bản" chỉ vì ai đó sửa một dấu phẩy.
    if (params.changes.isPublished !== undefined) {
      values.push(params.changes.isPublished);
      const flagIndex = values.length;
      assignments.push(`is_published = $${flagIndex}`);
      assignments.push(
        `published_at = CASE WHEN $${flagIndex} THEN COALESCE(published_at, now()) ELSE NULL END`,
      );
    }

    // Không có gì để sửa thì không chạy câu nào — một `UPDATE` rỗng vẫn đụng `updated_at`.
    if (assignments.length === 0)
      return this.findContentByGlobalId(params.contentId);

    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE dharma_contents
          SET ${assignments.join(', ')}, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${FullColumns}`,
      values,
    );
    return rows.length > 0 ? toContent(rows[0]) : null;
  }

  public async softDeleteContent(contentId: string): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE dharma_contents
          SET deleted_at = now(), is_published = false, published_at = NULL,
              updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [contentId],
    );
    return rows.length > 0;
  }

  public async incrementViewCount(contentId: string): Promise<void> {
    // KHÔNG đụng `updated_at`. Xem docblock của port.
    await updateReturning(
      this.manager,
      `UPDATE dharma_contents
          SET view_count = view_count + 1
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [contentId],
    );
  }

  public async startRecitation(params: {
    contentId: string;
    userId: string;
  }): Promise<IDharmaRecitation> {
    const [row] = await this.manager.query<IRecitationRow[]>(
      `INSERT INTO dharma_recitations (content_id, user_id)
       VALUES ($1, $2)
       RETURNING ${RecitationColumns}`,
      [params.contentId, params.userId],
    );
    return toRecitation(row);
  }

  public async findRecitationByGlobalId(
    globalId: string,
  ): Promise<IDharmaRecitation | null> {
    const [row] = await this.manager.query<IRecitationRow[]>(
      `SELECT ${RecitationColumns} FROM dharma_recitations WHERE global_id = $1`,
      [globalId],
    );
    return row ? toRecitation(row) : null;
  }

  public async completeRecitation(params: {
    recitationId: string;
    userId: string;
  }): Promise<IDharmaRecitation | null> {
    // `duration_seconds` tính ở DATABASE, không nhận từ client: một con số do client gửi là
    // một con số người dùng sửa được, và "đã tụng 3 tiếng" thành thứ bịa được.
    //
    // `AND user_id = $2 AND completed_at IS NULL` nằm trong WHERE của chính câu UPDATE: một
    // lượt đọc-rồi-kiểm-rồi-ghi để lọt hai request song song, và để lọt người KHÁC đánh dấu
    // hộ lượt tụng của mình.
    const rows = await updateReturning<IRecitationRow>(
      this.manager,
      `UPDATE dharma_recitations
          SET completed_at = now(),
              duration_seconds = GREATEST(
                0,
                floor(EXTRACT(EPOCH FROM (now() - started_at)))::int
              )
        WHERE global_id = $1 AND user_id = $2 AND completed_at IS NULL
        RETURNING ${RecitationColumns}`,
      [params.recitationId, params.userId],
    );
    return rows.length > 0 ? toRecitation(rows[0]) : null;
  }

  public async listOwnRecitations(query: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: IDharmaRecitation[]; total: number }> {
    const rows = await this.manager.query<IRecitationRow[]>(
      `SELECT ${RecitationColumns} FROM dharma_recitations
        WHERE user_id = $3
        ORDER BY started_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.userId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_recitations WHERE user_id = $1`,
      [query.userId],
    );
    return {
      items: (rows ?? []).map(toRecitation),
      total: Number(counted?.total ?? 0),
    };
  }

  public async countCompletedRecitations(contentId: string): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_recitations
        WHERE content_id = $1 AND completed_at IS NOT NULL`,
      [contentId],
    );
    return Number(row?.total ?? 0);
  }
}
