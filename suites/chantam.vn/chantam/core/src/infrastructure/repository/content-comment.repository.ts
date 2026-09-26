import {
  IAdminComment,
  ICommentPage,
  IContentComment,
  IContentCommentRepository,
  ICreateCommentParams,
} from '@/domain/ports/repository';
import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IKeysetCursor } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface ICommentRow {
  id: number | string;
  global_id: string;
  subject_type: ContentSubjectTypes;
  subject_id: string;
  author_id: string;
  username: string;
  full_name: string | null;
  body: string;
  status: CommentStatuses;
  depth: number | string;
  parent_id: string | null;
  reply_count: number | string;
  reaction_count: number | string;
  edited_at: Date | null;
  created_at: Date;
  media_keys: string[] | null;
}

const SelectColumns = `
  comment.id, comment.global_id, comment.subject_type, comment.subject_id,
  comment.author_id, author.username, author.full_name, comment.body,
  comment.status, comment.depth, comment.parent_id, comment.reply_count,
  comment.reaction_count, comment.edited_at, comment.created_at,
  -- Gom ảnh ngay trong câu chính: một truy vấn phụ cho từng bình luận là N+1
  -- đúng nghĩa khi một bài có 30 bình luận.
  (
    SELECT array_agg(media.storage_key ORDER BY media.slot)
    FROM content_comment_media media
    WHERE media.comment_id = comment.global_id
  ) AS media_keys
`;

function toComment(row: ICommentRow): IContentComment {
  return {
    id: Number(row.id),
    globalId: row.global_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    authorId: row.author_id,
    authorUsername: row.username,
    authorFullName: row.full_name,
    body: row.body,
    status: row.status,
    depth: Number(row.depth),
    parentId: row.parent_id,
    replyCount: Number(row.reply_count),
    reactionCount: Number(row.reaction_count),
    mediaKeys: row.media_keys ?? [],
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

@Injectable()
export class ContentCommentRepository implements IContentCommentRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  /**
   * Cộng/trừ số đếm bình luận công khai của chủ thể.
   *
   * CHỈ bình luận `VISIBLE` được tính. Một bình luận đang chờ Admin xem mà đã
   * cộng vào con số người ngoài nhìn thấy thì con số đó nói dối — người ta bấm
   * vào và thấy ít hơn.
   */
  private async bumpSubjectCounter(
    manager: EntityManager,
    subjectType: ContentSubjectTypes,
    subjectId: string,
    delta: number,
  ): Promise<void> {
    if (subjectType !== ContentSubjectTypes.POST) return;

    await manager.query(
      `
        UPDATE posts
        SET comment_count = GREATEST(0, comment_count + $2)
        WHERE global_id = $1
      `,
      [subjectId, delta],
    );
  }

  private async bumpReplyCounter(
    manager: EntityManager,
    parentId: string | null,
    delta: number,
  ): Promise<void> {
    if (!parentId) return;

    await manager.query(
      `
        UPDATE content_comments
        SET reply_count = GREATEST(0, reply_count + $2)
        WHERE global_id = $1
      `,
      [parentId, delta],
    );
  }

  public async create(params: ICreateCommentParams): Promise<IContentComment> {
    return this.manager.transaction(async (manager) => {
      const depth = params.parentId ? 2 : 1;
      const mediaKeys = params.mediaKeys.slice(0, 3);

      await manager.query(
        `
          INSERT INTO content_comments
            (global_id, subject_type, subject_id, author_id, body, status,
             depth, parent_id, parent_depth, flagged_terms, media_count)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          params.globalId,
          params.subjectType,
          params.subjectId,
          params.authorId,
          params.body,
          params.status,
          depth,
          params.parentId,
          params.parentId ? 1 : null,
          params.flaggedTerms,
          mediaKeys.length,
        ],
      );

      // Slot 1..3 theo thứ tự người dùng gửi lên. Trần do database giữ, nên gửi
      // quá thì phần thừa đã bị cắt ở trên chứ không để câu INSERT vỡ.
      for (const [index, storageKey] of mediaKeys.entries())
        await manager.query(
          `
            INSERT INTO content_comment_media (comment_id, slot, storage_key)
            VALUES ($1, $2, $3)
          `,
          [params.globalId, index + 1, storageKey],
        );

      if (params.status === CommentStatuses.VISIBLE) {
        await this.bumpSubjectCounter(
          manager,
          params.subjectType,
          params.subjectId,
          1,
        );
        await this.bumpReplyCounter(manager, params.parentId, 1);
      }

      const [row] = await manager.query<ICommentRow[]>(
        `
          SELECT ${SelectColumns}
          FROM content_comments comment
          JOIN users author ON author.global_id = comment.author_id
          WHERE comment.global_id = $1
        `,
        [params.globalId],
      );
      return toComment(row);
    });
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<IContentComment | null> {
    const [row] = await this.manager.query<ICommentRow[]>(
      `
        SELECT ${SelectColumns}
        FROM content_comments comment
        JOIN users author ON author.global_id = comment.author_id
        WHERE comment.global_id = $1
      `,
      [globalId],
    );
    return row ? toComment(row) : null;
  }

  public async listRoots(params: {
    subjectType: ContentSubjectTypes;
    subjectId: string;
    limit: number;
    before?: IKeysetCursor | null;
    viewerId?: string | null;
  }): Promise<ICommentPage> {
    const probe = params.limit + 1;
    const anchor = params.before ?? null;

    const rows = await this.manager.query<ICommentRow[]>(
      `
        SELECT ${SelectColumns}
        FROM content_comments comment
        JOIN users author ON author.global_id = comment.author_id
        WHERE comment.subject_type = $1
          AND comment.subject_id = $2
          AND comment.parent_id IS NULL
          -- Người ngoài chỉ thấy VISIBLE. Tác giả thấy thêm bình luận của CHÍNH
          -- MÌNH đang chờ duyệt — im lặng nuốt bài của họ thì họ sẽ gửi lại.
          AND (
            comment.status = 'VISIBLE'
            OR (comment.author_id = $3::uuid AND comment.status <> 'HIDDEN')
          )
          AND (
            $4::timestamptz IS NULL
            OR (comment.created_at, comment.id) < ($4::timestamptz, $5::bigint)
          )
        ORDER BY comment.created_at DESC, comment.id DESC
        LIMIT $6
      `,
      [
        params.subjectType,
        params.subjectId,
        params.viewerId ?? null,
        anchor?.createdAt ?? null,
        anchor?.id ?? 0,
        probe,
      ],
    );

    const hasMoreBefore = rows.length > params.limit;
    return {
      items: (hasMoreBefore ? rows.slice(0, params.limit) : rows).map(
        toComment,
      ),
      hasMoreBefore,
    };
  }

  public async listReplies(params: {
    parentId: string;
    limit: number;
    after?: IKeysetCursor | null;
    viewerId?: string | null;
  }): Promise<{ items: IContentComment[]; hasMoreAfter: boolean }> {
    const probe = params.limit + 1;
    const anchor = params.after ?? null;

    const rows = await this.manager.query<ICommentRow[]>(
      `
        SELECT ${SelectColumns}
        FROM content_comments comment
        JOIN users author ON author.global_id = comment.author_id
        WHERE comment.parent_id = $1
          AND (
            comment.status = 'VISIBLE'
            OR (comment.author_id = $2::uuid AND comment.status <> 'HIDDEN')
          )
          AND (
            $3::timestamptz IS NULL
            OR (comment.created_at, comment.id) > ($3::timestamptz, $4::bigint)
          )
        ORDER BY comment.created_at ASC, comment.id ASC
        LIMIT $5
      `,
      [
        params.parentId,
        params.viewerId ?? null,
        anchor?.createdAt ?? null,
        anchor?.id ?? 0,
        probe,
      ],
    );

    const hasMoreAfter = rows.length > params.limit;
    return {
      items: (hasMoreAfter ? rows.slice(0, params.limit) : rows).map(toComment),
      hasMoreAfter,
    };
  }

  public async updateBody(params: {
    globalId: string;
    body: string;
    status: CommentStatuses;
    flaggedTerms: string | null;
  }): Promise<IContentComment> {
    return this.manager.transaction(async (manager) => {
      const [before] = await manager.query<
        {
          status: CommentStatuses;
          subject_type: ContentSubjectTypes;
          subject_id: string;
          parent_id: string | null;
        }[]
      >(
        `
          SELECT status, subject_type, subject_id, parent_id
          FROM content_comments WHERE global_id = $1 FOR UPDATE
        `,
        [params.globalId],
      );

      await updateReturning(
        manager,
        `
          UPDATE content_comments
          SET body = $2, status = $3, flagged_terms = $4,
              edited_at = now(), updated_at = now()
          WHERE global_id = $1
          RETURNING id
        `,
        [params.globalId, params.body, params.status, params.flaggedTerms],
      );

      // Sửa xong mà bộ lọc gắn cờ thì bình luận rời khỏi công khai — số đếm
      // phải đi theo, nếu không con số nói dối cho tới lần Admin xử.
      const wasVisible = before.status === CommentStatuses.VISIBLE;
      const isVisible = params.status === CommentStatuses.VISIBLE;
      if (wasVisible !== isVisible) {
        const delta = isVisible ? 1 : -1;
        await this.bumpSubjectCounter(
          manager,
          before.subject_type,
          before.subject_id,
          delta,
        );
        await this.bumpReplyCounter(manager, before.parent_id, delta);
      }

      const [row] = await manager.query<ICommentRow[]>(
        `
          SELECT ${SelectColumns}
          FROM content_comments comment
          JOIN users author ON author.global_id = comment.author_id
          WHERE comment.global_id = $1
        `,
        [params.globalId],
      );
      return toComment(row);
    });
  }

  public async markStatus(params: {
    globalId: string;
    status: CommentStatuses;
  }): Promise<IContentComment> {
    return this.manager.transaction(async (manager) => {
      const [before] = await manager.query<
        {
          status: CommentStatuses;
          subject_type: ContentSubjectTypes;
          subject_id: string;
          parent_id: string | null;
        }[]
      >(
        `
          SELECT status, subject_type, subject_id, parent_id
          FROM content_comments WHERE global_id = $1 FOR UPDATE
        `,
        [params.globalId],
      );

      await updateReturning(
        manager,
        `
          UPDATE content_comments
          SET status = $2, updated_at = now()
          WHERE global_id = $1
          RETURNING id
        `,
        [params.globalId, params.status],
      );

      const wasVisible = before.status === CommentStatuses.VISIBLE;
      const isVisible = params.status === CommentStatuses.VISIBLE;
      if (wasVisible !== isVisible) {
        const delta = isVisible ? 1 : -1;
        await this.bumpSubjectCounter(
          manager,
          before.subject_type,
          before.subject_id,
          delta,
        );
        await this.bumpReplyCounter(manager, before.parent_id, delta);
      }

      const [row] = await manager.query<ICommentRow[]>(
        `
          SELECT ${SelectColumns}
          FROM content_comments comment
          JOIN users author ON author.global_id = comment.author_id
          WHERE comment.global_id = $1
        `,
        [params.globalId],
      );
      return toComment(row);
    });
  }

  public async findForAdmin(params: {
    status?: CommentStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IAdminComment[]; total: number }> {
    const values: unknown[] = [];
    let statusCondition = '';

    if (params.status) {
      values.push(params.status);
      statusCondition = `AND comment.status = $${values.length}`;
    }

    values.push(params.take, params.skip);

    const rows = await this.manager.query<
      {
        global_id: string;
        subject_type: ContentSubjectTypes;
        subject_id: string;
        subject_title: string | null;
        author_id: string;
        username: string;
        body: string;
        status: CommentStatuses;
        flagged_terms: string | null;
        created_at: Date;
        total: string;
      }[]
    >(
      `
        SELECT comment.global_id, comment.subject_type, comment.subject_id,
               post.title AS subject_title,
               comment.author_id, author.username, comment.body,
               comment.status, comment.flagged_terms, comment.created_at,
               COUNT(*) OVER () AS total
        FROM content_comments comment
        INNER JOIN users author ON author.global_id = comment.author_id
        -- Bình luận có thể treo dưới nhiều loại chủ thể; chỉ bài đăng mới có
        -- tiêu đề, nên LEFT JOIN và chấp nhận null cho loại khác.
        LEFT JOIN posts post
          ON comment.subject_type = 'POST' AND post.global_id = comment.subject_id
        WHERE comment.status <> 'REMOVED' ${statusCondition}
        ORDER BY comment.created_at ASC, comment.id ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );

    return {
      items: rows.map((row) => ({
        commentId: row.global_id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        subjectTitle: row.subject_title,
        authorId: row.author_id,
        authorUsername: row.username,
        body: row.body,
        status: row.status,
        flaggedTerms: row.flagged_terms,
        createdAt: row.created_at,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }
}
