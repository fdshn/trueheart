import {
  CharityUploadReservation,
  ICharityEventRepository,
  ICharityEventStep,
  ICharityEventStepPatch,
  ICharityPost,
} from '@/domain/ports/repository';
import {
  CharityEventStepKey,
  CharityEventStepKeys,
  CharityEventStepStatus,
  CharityOperationStage,
  CharityPostAuthorRole,
  CharityPostMediaType,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

const StepColumns = `global_id, round_id, step_key, planned_at, actual_at, status, note, sort_order,
  updated_by, updated_at`;

interface IStepRow {
  global_id: string;
  round_id: string | null;
  step_key: CharityEventStepKey;
  planned_at: Date | null;
  actual_at: Date | null;
  status: CharityEventStepStatus;
  note: string | null;
  sort_order: number;
  updated_by: string | null;
  updated_at: Date;
}

const toStep = (row: IStepRow): ICharityEventStep => ({
  stepId: row.global_id,
  roundId: row.round_id,
  stepKey: row.step_key,
  plannedAt: row.planned_at,
  actualAt: row.actual_at,
  status: row.status,
  note: row.note,
  sortOrder: row.sort_order,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

const PostSelect = `
  SELECT post.global_id, post.campaign_id, post.author_id, author.username,
         author.full_name, author.avatar_url, post.author_role, post.stage, post.body,
         post.created_at, post.deleted_at, post.hidden_at,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'storageKey', media.storage_key, 'publicUrl', media.public_url,
                    'mediaType', media.media_type, 'sortOrder', media.sort_order,
                    'durationSeconds', media.duration_seconds)
                    ORDER BY media.sort_order)
                   FROM campaign_post_media media WHERE media.post_id = post.global_id),
                  '[]'::jsonb) AS media,
         (SELECT count(*) FROM content_reactions reaction
           WHERE reaction.subject_type = 'CHARITY_CAMPAIGN_POST'
             AND reaction.subject_id = post.global_id) AS reaction_count,
         (SELECT count(*) FROM content_comments comment
           WHERE comment.subject_type = 'CHARITY_CAMPAIGN_POST'
             AND comment.subject_id = post.global_id
             AND comment.status = 'VISIBLE') AS comment_count
  FROM campaign_posts post
  JOIN users author ON author.global_id = post.author_id`;

interface IPostRow {
  global_id: string;
  campaign_id: string;
  author_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  author_role: CharityPostAuthorRole;
  stage: CharityOperationStage;
  body: string | null;
  created_at: Date;
  deleted_at: Date | null;
  hidden_at: Date | null;
  media: ICharityPost['media'];
  reaction_count: string | number;
  comment_count: string | number;
}

const toPost = (row: IPostRow): ICharityPost => ({
  postId: row.global_id,
  campaignId: row.campaign_id,
  author: {
    userId: row.author_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  },
  authorRole: row.author_role,
  stage: row.stage,
  body: row.body,
  media: row.media ?? [],
  reactionCount: Number(row.reaction_count ?? 0),
  commentCount: Number(row.comment_count ?? 0),
  createdAt: row.created_at,
  deletedAt: row.deleted_at,
  hiddenAt: row.hidden_at,
});

/** Huỷ transaction từ bên trong `createPost` mà vẫn trả kết quả có nghĩa cho nơi gọi. */
class MediaInvalid extends Error {}

/** Dự án từ thiện — đợt 3 (CHARITY-PROJECT-LIFECYCLE §3.5). */
@Injectable()
export class CharityEventRepository implements ICharityEventRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  // ── Timeline ──────────────────────────────────────────────────────────

  public async ensureEventSteps(
    campaignId: string,
    roundId: string | null = null,
  ): Promise<void> {
    // Khoá trùng là index biểu thức (dự án, đợt, bước) — `ON CONFLICT` phải nêu đúng biểu thức.
    await this.manager.query(
      `INSERT INTO campaign_event_steps (campaign_id, round_id, step_key, sort_order)
       SELECT $1, $4::uuid, step.key, step.sort_order
       FROM unnest($2::text[], $3::int[]) AS step(key, sort_order)
       ON CONFLICT (campaign_id, (COALESCE(round_id, '00000000-0000-0000-0000-000000000000'::uuid)), step_key)
       DO NOTHING`,
      [
        campaignId,
        [...CharityEventStepKeys],
        CharityEventStepKeys.map((_, index) => index),
        roundId,
      ],
    );
  }

  public async listEventSteps(
    campaignId: string,
    roundId: string | null = null,
  ): Promise<ICharityEventStep[]> {
    const rows = await this.manager.query<IStepRow[]>(
      `SELECT ${StepColumns} FROM campaign_event_steps
       WHERE campaign_id = $1 AND round_id IS NOT DISTINCT FROM $2::uuid
       ORDER BY sort_order`,
      [campaignId, roundId],
    );
    return rows.map(toStep);
  }

  public async updateEventStep(params: {
    campaignId: string;
    stepId: string;
    actorId: string;
    patch: ICharityEventStepPatch;
  }): Promise<ICharityEventStep | null> {
    const patch = params.patch;
    // Một câu: field `undefined` giữ nguyên nhờ cờ "có gửi"; xong mà không ghi giờ thì lấy
    // giờ hiện tại (CHECK `done_time`). Mỗi giá trị một tham số riêng — không dùng lại `$n`
    // khác kiểu (42P08).
    const rows = await updateReturning<IStepRow>(
      this.manager,
      `UPDATE campaign_event_steps
       SET planned_at = CASE WHEN $3::boolean THEN $4::timestamptz ELSE planned_at END,
           status = COALESCE($5::varchar, status),
           actual_at = CASE
             WHEN $6::boolean THEN $7::timestamptz
             WHEN COALESCE($5::varchar, status) = 'DONE' AND actual_at IS NULL THEN now()
             ELSE actual_at END,
           note = CASE WHEN $8::boolean THEN $9::varchar ELSE note END,
           updated_by = $10, updated_at = now()
       WHERE campaign_id = $1 AND global_id = $2
       RETURNING ${StepColumns}`,
      [
        params.campaignId,
        params.stepId,
        patch.plannedAt !== undefined,
        patch.plannedAt ?? null,
        patch.status ?? null,
        patch.actualAt !== undefined,
        patch.actualAt ?? null,
        patch.note !== undefined,
        patch.note ?? null,
        params.actorId,
      ],
    );
    return rows.length > 0 ? toStep(rows[0]) : null;
  }

  // ── Quyền đăng của participant ────────────────────────────────────

  public async summaryStartedAt(campaignId: string): Promise<Date | null> {
    const [row] = await this.manager.query<{ at: Date | null }[]>(
      `SELECT max(created_at) AS at FROM campaign_stage_events
       WHERE campaign_id = $1 AND to_stage = 'SUMMARY'`,
      [campaignId],
    );
    return row?.at ?? null;
  }

  public async isAttendedParticipant(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ ok: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM campaign_participations
                      WHERE campaign_id = $1 AND user_id = $2
                        AND status IN ('CHECKED_IN', 'COMPLETED')) AS ok`,
      [campaignId, userId],
    );
    return row?.ok === true;
  }

  // ── Quota và đường tải ────────────────────────────────────────────────

  public async reserveUpload<T extends { key: string }>(params: {
    campaignId: string;
    userId: string;
    mediaType: CharityPostMediaType;
    since: Date;
    quota: number;
    durationSeconds?: number | null;
    sign: () => Promise<T>;
  }): Promise<CharityUploadReservation<T>> {
    return this.manager.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `charity-upload:${params.campaignId}:${params.userId}`,
      ]);
      const [{ used }] = await manager.query<{ used: number }[]>(
        `SELECT count(*)::int AS used FROM campaign_post_uploads
         WHERE campaign_id = $1 AND user_id = $2 AND media_type = $3 AND created_at >= $4`,
        [params.campaignId, params.userId, params.mediaType, params.since],
      );
      if (used >= params.quota) return { status: 'QUOTA_EXCEEDED', used };
      const upload = await params.sign();
      await manager.query(
        `INSERT INTO campaign_post_uploads
           (campaign_id, user_id, storage_key, media_type, duration_seconds)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          params.campaignId,
          params.userId,
          upload.key,
          params.mediaType,
          params.durationSeconds ?? null,
        ],
      );
      return { status: 'RESERVED', upload };
    });
  }

  public async usedUploads(params: {
    campaignId: string;
    userId: string;
    since: Date;
  }): Promise<Record<CharityPostMediaType, number>> {
    const rows = await this.manager.query<
      { media_type: CharityPostMediaType; used: number }[]
    >(
      `SELECT media_type, count(*)::int AS used FROM campaign_post_uploads
       WHERE campaign_id = $1 AND user_id = $2 AND created_at >= $3
       GROUP BY media_type`,
      [params.campaignId, params.userId, params.since],
    );
    const used = { IMAGE: 0, VIDEO: 0 };
    for (const row of rows) used[row.media_type] = row.used;
    return used;
  }

  // ── Bài ───────────────────────────────────────────────────────────────

  public async createPost(params: {
    campaignId: string;
    authorId: string;
    authorRole: CharityPostAuthorRole;
    stage: CharityOperationStage;
    body: string | null;
    media: {
      storageKey: string;
      publicUrl: string;
      mediaType: CharityPostMediaType;
    }[];
  }): Promise<ICharityPost | 'MEDIA_INVALID'> {
    try {
      const postId = await this.manager.transaction(async (manager) => {
        if (params.media.length > 0) {
          // Tiêu lượt ký: chỉ của CHÍNH người này, cho dự án này, chưa dùng. Hai bài song
          // song cùng một khoá thì một bên thấy thiếu dòng và rollback.
          const consumed = await updateReturning<{
            storage_key: string;
            media_type: CharityPostMediaType;
          }>(
            manager,
            `UPDATE campaign_post_uploads SET consumed_at = now()
             WHERE campaign_id = $1 AND user_id = $2 AND storage_key = ANY($3::text[])
               AND consumed_at IS NULL
             RETURNING storage_key, media_type`,
            [
              params.campaignId,
              params.authorId,
              params.media.map((item) => item.storageKey),
            ],
          );
          const typeOf = new Map(
            consumed.map((row) => [row.storage_key, row.media_type]),
          );
          if (
            consumed.length !== params.media.length ||
            params.media.some(
              (item) => typeOf.get(item.storageKey) !== item.mediaType,
            )
          )
            throw new MediaInvalid();
        }
        const [post] = await manager.query<{ global_id: string }[]>(
          `INSERT INTO campaign_posts (campaign_id, author_id, author_role, stage, body)
           VALUES ($1, $2, $3, $4, $5) RETURNING global_id`,
          [
            params.campaignId,
            params.authorId,
            params.authorRole,
            params.stage,
            params.body,
          ],
        );
        for (const [index, item] of params.media.entries())
          await manager.query(
            `INSERT INTO campaign_post_media
               (post_id, storage_key, public_url, media_type, sort_order, duration_seconds)
             VALUES ($1, $2, $3, $4, $5,
                     (SELECT duration_seconds FROM campaign_post_uploads
                       WHERE storage_key = $6::text))`,
            [
              post.global_id,
              item.storageKey,
              item.publicUrl,
              item.mediaType,
              index,
              // Tham số riêng cho câu con — dùng lại `$2` vừa ghi cột vừa so là 42P08.
              item.storageKey,
            ],
          );
        return post.global_id;
      });
      return (await this.findPost(postId))!;
    } catch (error) {
      if (error instanceof MediaInvalid) return 'MEDIA_INVALID';
      throw error;
    }
  }

  public async listPosts(params: {
    campaignId: string;
    beforePostId: string | null;
    limit: number;
  }): Promise<ICharityPost[]> {
    const rows = await this.manager.query<IPostRow[]>(
      `${PostSelect}
       WHERE post.campaign_id = $1 AND post.deleted_at IS NULL AND post.hidden_at IS NULL
         AND ($2::uuid IS NULL
              OR post.id < (SELECT id FROM campaign_posts WHERE global_id = $2::uuid))
       ORDER BY post.id DESC
       LIMIT $3`,
      [params.campaignId, params.beforePostId, params.limit],
    );
    return rows.map(toPost);
  }

  public async findPost(postId: string): Promise<ICharityPost | null> {
    const [row] = await this.manager.query<IPostRow[]>(
      `${PostSelect} WHERE post.global_id = $1`,
      [postId],
    );
    return row ? toPost(row) : null;
  }

  public async deletePost(params: {
    campaignId: string;
    postId: string;
    actorId: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_posts SET deleted_at = now(), deleted_by = $3
       WHERE campaign_id = $1 AND global_id = $2 AND deleted_at IS NULL
       RETURNING global_id`,
      [params.campaignId, params.postId, params.actorId],
    );
    return rows.length > 0;
  }
}
