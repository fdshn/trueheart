import {
  ICreateDharmaContentParams,
  IDharmaContent,
  IDharmaContentPage,
  IDharmaContentSummary,
  IDharmaDedication,
  IDharmaRecitation,
  IDharmaRepository,
  IDharmaThread,
  IPublicDedication,
  IWriteDharmaContentParams,
} from '@/domain/ports/repository';
import {
  DharmaContentType,
  DharmaThreadStatus,
  dedicatorLabel,
} from '@chantam.vn/chantam.core-lib/models';
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

  // ── Diễn đàn Phật Pháp (UC-DHARMA-03) ──────────────────────────────────────

  public async createThread(params: {
    authorId: string;
    title: string;
    bodyText: string;
    category: string | null;
    status: DharmaThreadStatus;
    flaggedTerms: string | null;
  }): Promise<IDharmaThread> {
    // HAI câu lệnh, không một câu với CTE.
    //
    // Bản đầu của tôi viết `WITH inserted AS (INSERT ... RETURNING global_id) SELECT ...
    // FROM dharma_threads WHERE global_id = (SELECT global_id FROM inserted)` — và nó trả **0
    // hàng**. Lý do là ngủ nghĩa Postgres: mọi câu con trong một `WITH` dùng CHUNG một
    // snapshot, nên phần `SELECT` đọc bảng `dharma_threads` ở trạng thái TRƯỚC câu lệnh và
    // không thấy hàng vừa chèn.
    //
    // (Ở `MeritRepository.createUnit` cùng lối CTE lại chạy đúng, vì ở đó `SELECT` đọc
    // **từ chính CTE** (`FROM inserted`), không đọc lại bảng. Khác biệt mỏng đúng một chữ.)
    //
    // Không đọc thẳng `RETURNING ${ThreadColumns}` được vì `ThreadColumns` có hai câu con đếm
    // bình luận và cảm xúc, mà `RETURNING` không chạy được câu con tham chiếu bảng khác.
    const [inserted] = await this.manager.query<{ global_id: string }[]>(
      `INSERT INTO dharma_threads
         (author_id, title, body_text, category, status, flagged_terms)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING global_id`,
      [
        params.authorId,
        params.title,
        params.bodyText,
        params.category,
        params.status,
        params.flaggedTerms,
      ],
    );
    const thread = await this.findThreadByGlobalId(inserted.global_id);
    // `thread` không thể `null` ngay sau lượt chèn thành công, nhưng kiểu trả về của
    // `findThreadByGlobalId` cho phép, nên nói ra thay vì `!`.
    if (!thread)
      throw new Error(
        `Vừa chèn chủ đề ${inserted.global_id} nhưng đọc lại không thấy`,
      );
    return thread;
  }

  public async findThreadByGlobalId(
    globalId: string,
  ): Promise<IDharmaThread | null> {
    const [row] = await this.manager.query<IThreadRow[]>(
      `SELECT ${ThreadColumns} FROM dharma_threads
        WHERE dharma_threads.global_id = $1`,
      [globalId],
    );
    return row ? toThread(row) : null;
  }

  public async listPublicThreads(query: {
    limit: number;
    offset: number;
    category?: string;
  }): Promise<{ items: IDharmaThread[]; total: number }> {
    const values: unknown[] = [];
    let filter = '';
    if (query.category) {
      values.push(query.category);
      filter = `AND dharma_threads.category = $${values.length}`;
    }

    // Câu đếm dùng ĐÚNG bộ lọc và ĐÚNG mảng tham số của câu đọc. Hai bản lọc lệch nhau là
    // người dùng thấy "48 chủ đề" rồi nhận về 12 hàng.
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_threads
        WHERE dharma_threads.status = 'VISIBLE' ${filter}`,
      values,
    );
    // Ghim lên trước, rồi mới nhất trước — đúng thứ tự `IDX_dharma_threads_public`.
    const rows = await this.manager.query<IThreadRow[]>(
      `SELECT ${ThreadColumns} FROM dharma_threads
        WHERE dharma_threads.status = 'VISIBLE' ${filter}
        ORDER BY dharma_threads.is_pinned DESC, dharma_threads.created_at DESC,
                 dharma_threads.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toThread),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listThreadsForAdmin(query: {
    limit: number;
    offset: number;
    status?: DharmaThreadStatus;
  }): Promise<{ items: IDharmaThread[]; total: number }> {
    const values: unknown[] = [];
    let filter = '';
    if (query.status) {
      values.push(query.status);
      filter = `WHERE dharma_threads.status = $${values.length}`;
    }

    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_threads ${filter}`,
      values,
    );
    // Hàng đợi kiểm duyệt: CŨ NHẤT trước. Mới nhất trước là để chủ đề bị báo xấu đầu tiên
    // nằm mãi ở cuối danh sách.
    const rows = await this.manager.query<IThreadRow[]>(
      `SELECT ${ThreadColumns} FROM dharma_threads
        ${filter}
        ORDER BY dharma_threads.created_at ASC, dharma_threads.id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toThread),
      total: Number(counted?.total ?? 0),
    };
  }

  public async moderateThread(params: {
    threadId: string;
    moderatorId: string;
    status?: DharmaThreadStatus;
    isLocked?: boolean;
    isPinned?: boolean;
    note: string | null;
  }): Promise<IDharmaThread | null> {
    const assignments: string[] = [
      'moderated_by = $2',
      'moderated_at = now()',
      'moderation_note = $3',
      'updated_at = now()',
    ];
    const values: unknown[] = [
      params.threadId,
      params.moderatorId,
      params.note,
    ];

    if (params.status !== undefined) {
      values.push(params.status);
      assignments.push(`status = $${values.length}`);
    }
    if (params.isLocked !== undefined) {
      values.push(params.isLocked);
      assignments.push(`is_locked = $${values.length}`);
    }
    if (params.isPinned !== undefined) {
      values.push(params.isPinned);
      assignments.push(`is_pinned = $${values.length}`);
    }

    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE dharma_threads SET ${assignments.join(', ')}
        WHERE global_id = $1
        RETURNING global_id`,
      values,
    );
    if (rows.length === 0) return null;

    // Đọc lại để hai con số đếm phản ánh đúng hiện tại — `RETURNING` không chạy được câu con.
    return this.findThreadByGlobalId(params.threadId);
  }

  // ── Hồi hướng (UC-DHARMA-04) ───────────────────────────────────────────────

  public async createDedication(params: {
    userId: string;
    recitationId: string | null;
    dedicateeName: string | null;
    text: string;
    isPublic: boolean;
    isAnonymous: boolean;
  }): Promise<IDharmaDedication> {
    const [row] = await this.manager.query<IDedicationRow[]>(
      `INSERT INTO dharma_dedications
         (user_id, recitation_id, dedicatee_name, text, is_public, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${DedicationColumns}`,
      [
        params.userId,
        params.recitationId,
        params.dedicateeName,
        params.text,
        params.isPublic,
        params.isAnonymous,
      ],
    );
    return toDedication(row);
  }

  public async listPublicDedications(query: {
    limit: number;
    offset: number;
  }): Promise<{ items: IPublicDedication[]; total: number }> {
    // CHỈ lấy tên cho hàng KHÔNG ẩn danh — câu SQL không kéo tên người ẩn danh về.
    //
    // Ẩn danh được quyết ĐÚNG MỘT NƠI: mệnh đề `CASE` dưới đây. `test:merit` đã bắt được
    // lỗi khi tôi kiểm `is_anonymous` lần hai ở mapper — lớp thứ hai lặng lẽ cứu, và phá
    // mệnh đề SQL không làm phép kiểm nào đỏ.
    const rows = await this.manager.query<
      {
        global_id: string;
        display_name: string | null;
        dedicatee_name: string | null;
        text: string;
        created_at: Date;
      }[]
    >(
      `SELECT dedication.global_id,
              CASE
                WHEN dedication.is_anonymous THEN NULL
                ELSE COALESCE(NULLIF(btrim(author.full_name), ''), author.username)
              END AS display_name,
              dedication.dedicatee_name, dedication.text, dedication.created_at
         FROM dharma_dedications dedication
         LEFT JOIN users author ON author.global_id = dedication.user_id
        WHERE dedication.is_public
        ORDER BY dedication.created_at DESC, dedication.id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_dedications WHERE is_public`,
    );

    return {
      items: (rows ?? []).map((row) => ({
        globalId: row.global_id,
        dedicatorLabel: dedicatorLabel(row.display_name),
        dedicateeName: row.dedicatee_name,
        text: row.text,
        createdAt: row.created_at,
      })),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listOwnDedications(query: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: IDharmaDedication[]; total: number }> {
    // KHÔNG ẩn danh ở đây — họ xem lại lời của chính mình, và gồm cả hàng không công khai.
    const rows = await this.manager.query<IDedicationRow[]>(
      `SELECT ${DedicationColumns} FROM dharma_dedications
        WHERE user_id = $3
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.userId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_dedications WHERE user_id = $1`,
      [query.userId],
    );
    return {
      items: (rows ?? []).map(toDedication),
      total: Number(counted?.total ?? 0),
    };
  }
}

/**
 * Hai cột đếm của chủ đề, dựng bằng CÂU CON chứ không cột lưu sẵn.
 *
 * `posts.comment_count` và `posts.reaction_count` là bản sao của đúng hai bảng dưới đây, và
 * chúng đã trôi. Ở đây hai bảng có sẵn nên đếm — một chủ đề có vài chục bình luận, không phải
 * chỗ cần tối ưu.
 *
 * `status <> 'REMOVED'` ở câu đếm bình luận: bình luận bị gỡ không còn hiện, nên đếm nó vào
 * là nói với người đọc rằng có 12 câu trả lời trong khi họ chỉ thấy 9.
 */
const ThreadCountColumns = `(SELECT count(*) FROM content_comments comment
         WHERE comment.subject_type = 'DHARMA_THREAD'
           AND comment.subject_id = dharma_threads.global_id
           AND comment.status <> 'REMOVED') AS comment_count,
       (SELECT count(*) FROM content_reactions reaction
         WHERE reaction.subject_type = 'DHARMA_THREAD'
           AND reaction.subject_id = dharma_threads.global_id) AS reaction_count`;

const ThreadColumns = `dharma_threads.global_id, dharma_threads.author_id,
       dharma_threads.title, dharma_threads.body_text, dharma_threads.category,
       dharma_threads.status, dharma_threads.flagged_terms, dharma_threads.is_locked,
       dharma_threads.is_pinned, dharma_threads.moderated_by, dharma_threads.moderated_at,
       dharma_threads.moderation_note, dharma_threads.created_at, dharma_threads.updated_at,
       ${ThreadCountColumns}`;

interface IThreadRow {
  global_id: string;
  author_id: string | null;
  title: string;
  body_text: string;
  category: string | null;
  status: string;
  flagged_terms: string | null;
  is_locked: boolean;
  is_pinned: boolean;
  moderated_by: string | null;
  moderated_at: Date | null;
  moderation_note: string | null;
  created_at: Date;
  updated_at: Date;
  comment_count: string | number;
  reaction_count: string | number;
}

interface IDedicationRow {
  global_id: string;
  user_id: string;
  recitation_id: string | null;
  dedicatee_name: string | null;
  text: string;
  is_public: boolean;
  is_anonymous: boolean;
  created_at: Date;
}

const DedicationColumns = `global_id, user_id, recitation_id, dedicatee_name, text,
       is_public, is_anonymous, created_at`;

function toThread(row: IThreadRow): IDharmaThread {
  return {
    globalId: row.global_id,
    authorId: row.author_id,
    title: row.title,
    bodyText: row.body_text,
    category: row.category,
    status: row.status as DharmaThreadStatus,
    flaggedTerms: row.flagged_terms,
    isLocked: row.is_locked,
    isPinned: row.is_pinned,
    moderatedBy: row.moderated_by,
    moderatedAt: row.moderated_at,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // `count(*)` về đây là CHUỖI. Trả thẳng ra API thì client nhận `"12"`.
    commentCount: Number(row.comment_count),
    reactionCount: Number(row.reaction_count),
  };
}

function toDedication(row: IDedicationRow): IDharmaDedication {
  return {
    globalId: row.global_id,
    userId: row.user_id,
    recitationId: row.recitation_id,
    dedicateeName: row.dedicatee_name,
    text: row.text,
    isPublic: row.is_public,
    isAnonymous: row.is_anonymous,
    createdAt: row.created_at,
  };
}
