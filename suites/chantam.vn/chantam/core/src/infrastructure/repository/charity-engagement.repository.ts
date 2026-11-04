import {
  ICharityAnnouncement,
  ICharityChangedField,
  ICharityEngagementCounters,
  ICharityEngagementRepository,
  ICharityExport,
  ICharityInternalStats,
  ICharityPreEventCandidate,
  ICharityRevision,
  ICharityTask,
  ICharityTaskPatch,
} from '@/domain/ports/repository';
import {
  CharityAnnouncementKind,
  CharityOperationStage,
  CharityRevisionEntity,
  CharityTaskKey,
  CharityTaskKeys,
  CharityTaskStatus,
  CharityTaskUpdateMode,
  diffCharityRevisions,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { recordCharityRevisions } from './charity-revision.writer';
import { updateReturning } from './update-returning';

const num = (value: unknown): number => Number(value ?? 0);

interface IRevisionRow {
  global_id: string;
  entity: CharityRevisionEntity;
  entity_id: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  is_public: boolean;
  is_important: boolean;
  changed_by: string | null;
  reason: string | null;
  created_at: Date;
}

const toRevision = (row: IRevisionRow): ICharityRevision => ({
  revisionId: row.global_id,
  entity: row.entity,
  entityId: row.entity_id,
  field: row.field,
  oldValue: row.old_value,
  newValue: row.new_value,
  isPublic: row.is_public,
  isImportant: row.is_important,
  changedBy: row.changed_by,
  reason: row.reason,
  createdAt: row.created_at,
});

const TaskColumns = `global_id, task_key, scheduled_at, work_note, remark, pic_name,
  pic_user_id, update_mode, status, sort_order, updated_by, updated_at`;

interface ITaskRow {
  global_id: string;
  task_key: CharityTaskKey;
  scheduled_at: Date | null;
  work_note: string | null;
  remark: string | null;
  pic_name: string | null;
  pic_user_id: string | null;
  update_mode: CharityTaskUpdateMode | null;
  status: CharityTaskStatus;
  sort_order: number;
  updated_by: string | null;
  updated_at: Date;
}

const toTask = (row: ITaskRow): ICharityTask => ({
  taskId: row.global_id,
  taskKey: row.task_key,
  scheduledAt: row.scheduled_at,
  workNote: row.work_note,
  remark: row.remark,
  picName: row.pic_name,
  picUserId: row.pic_user_id,
  updateMode: row.update_mode,
  status: row.status,
  sortOrder: row.sort_order,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

interface IExportRow {
  global_id: string;
  campaign_id: string;
  section_key: CharityOperationStage | null;
  snapshot: Record<string, unknown>;
  last_revision_id: string | null;
  generated_by: string | null;
  generated_at: Date;
}

const toExport = (row: IExportRow): ICharityExport => ({
  exportId: row.global_id,
  campaignId: row.campaign_id,
  sectionKey: row.section_key,
  snapshot: row.snapshot,
  lastRevisionId: row.last_revision_id,
  generatedBy: row.generated_by,
  generatedAt: row.generated_at,
});

/** Dự án từ thiện — đợt 2 (CHARITY-PROJECT-LIFECYCLE §3.3, §3.4, §3.7, §3.10, §3.13). */
@Injectable()
export class CharityEngagementRepository implements ICharityEngagementRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  // ── Lịch sử sửa ───────────────────────────────────────────────────────

  public async listRevisions(params: {
    campaignId: string;
    publicOnly: boolean;
    beforeRevisionId: string | null;
    limit: number;
  }): Promise<ICharityRevision[]> {
    const rows = await this.manager.query<IRevisionRow[]>(
      `SELECT global_id, entity, entity_id, field, old_value, new_value, is_public,
              is_important, changed_by, reason, created_at
       FROM campaign_revisions
       WHERE campaign_id = $1
         AND (NOT $2::boolean OR is_public)
         AND ($3::uuid IS NULL
              OR id < (SELECT id FROM campaign_revisions WHERE global_id = $3::uuid))
       ORDER BY id DESC
       LIMIT $4`,
      [
        params.campaignId,
        params.publicOnly,
        params.beforeRevisionId,
        params.limit,
      ],
    );
    return rows.map(toRevision);
  }

  public async listChangedFields(params: {
    campaignId: string;
    publicOnly: boolean;
  }): Promise<ICharityChangedField[]> {
    // Checklist (`TASK`) là tiến độ, không phải sửa kế hoạch — không tô đỏ.
    const rows = await this.manager.query<
      {
        entity: CharityRevisionEntity;
        entity_id: string | null;
        field: string;
        created_at: Date;
      }[]
    >(
      `SELECT DISTINCT ON (entity, entity_id, field) entity, entity_id, field, created_at
       FROM campaign_revisions
       WHERE campaign_id = $1 AND entity <> 'TASK' AND (NOT $2::boolean OR is_public)
       ORDER BY entity, entity_id, field, id DESC`,
      [params.campaignId, params.publicOnly],
    );
    return rows.map((row) => ({
      entity: row.entity,
      entityId: row.entity_id,
      field: row.field,
      changedAt: row.created_at,
    }));
  }

  public async lastRevisionId(campaignId: string): Promise<string | null> {
    const [row] = await this.manager.query<{ global_id: string }[]>(
      `SELECT global_id FROM campaign_revisions WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1`,
      [campaignId],
    );
    return row?.global_id ?? null;
  }

  // ── Checklist tab B ───────────────────────────────────────────────────

  public async ensureTasks(params: {
    campaignId: string;
    schedule: Partial<Record<CharityTaskKey, Date>>;
  }): Promise<void> {
    await this.manager.query(
      `INSERT INTO campaign_tasks (campaign_id, task_key, scheduled_at, sort_order)
       SELECT $1, task.key, task.scheduled_at, task.sort_order
       FROM unnest($2::text[], $3::timestamptz[], $4::int[])
         AS task(key, scheduled_at, sort_order)
       ON CONFLICT (campaign_id, task_key) DO NOTHING`,
      [
        params.campaignId,
        [...CharityTaskKeys],
        CharityTaskKeys.map((key) => params.schedule[key] ?? null),
        CharityTaskKeys.map((_, index) => index),
      ],
    );
  }

  public async listTasks(campaignId: string): Promise<ICharityTask[]> {
    const rows = await this.manager.query<ITaskRow[]>(
      `SELECT ${TaskColumns} FROM campaign_tasks WHERE campaign_id = $1 ORDER BY sort_order`,
      [campaignId],
    );
    return rows.map(toTask);
  }

  public async updateTask(params: {
    campaignId: string;
    taskId: string;
    actorId: string;
    patch: ICharityTaskPatch;
  }): Promise<ICharityTask | null> {
    return this.manager.transaction(async (manager) => {
      const [current] = await manager.query<ITaskRow[]>(
        `SELECT ${TaskColumns} FROM campaign_tasks
         WHERE campaign_id = $1 AND global_id = $2 FOR UPDATE`,
        [params.campaignId, params.taskId],
      );
      if (!current) return null;
      const before = toTask(current);
      const pick = <K extends keyof ICharityTaskPatch>(key: K) =>
        params.patch[key] === undefined
          ? (before[key as keyof ICharityTask] as ICharityTaskPatch[K])
          : params.patch[key];
      const [row] = await updateReturning<ITaskRow>(
        manager,
        `UPDATE campaign_tasks
         SET scheduled_at = $3, work_note = $4, remark = $5, pic_name = $6, pic_user_id = $7,
             update_mode = $8, status = $9, updated_by = $10, updated_at = now()
         WHERE campaign_id = $1 AND global_id = $2
         RETURNING ${TaskColumns}`,
        [
          params.campaignId,
          params.taskId,
          pick('scheduledAt'),
          pick('workNote'),
          pick('remark'),
          pick('picName'),
          pick('picUserId'),
          pick('updateMode'),
          pick('status'),
          params.actorId,
        ],
      );
      const after = toTask(row);
      const snapshot = (task: ICharityTask) => ({
        id: task.taskId,
        values: {
          taskKey: task.taskKey,
          status: task.status,
          scheduledAt: task.scheduledAt,
        },
      });
      await recordCharityRevisions(manager, {
        campaignId: params.campaignId,
        actorId: params.actorId,
        reason: null,
        drafts: diffCharityRevisions(
          'TASK',
          [snapshot(before)],
          [snapshot(after)],
        ),
      });
      return after;
    });
  }

  public async taskScheduleInputs(campaignId: string): Promise<{
    earliestIntakeDeadline: Date | null;
    distributionStartsAt: Date | null;
  }> {
    const [row] = await this.manager.query<
      { intake: Date | null; distribution: Date | null }[]
    >(
      `SELECT (SELECT min(intake_deadline) FROM campaign_need_items
                WHERE campaign_id = $1 AND is_active) AS intake,
              (SELECT starts_at FROM campaign_phases
                WHERE campaign_id = $1 AND phase = 'DISTRIBUTION') AS distribution`,
      [campaignId],
    );
    return {
      earliestIntakeDeadline: row?.intake ?? null,
      distributionStartsAt: row?.distribution ?? null,
    };
  }

  // ── Quan tâm, đếm, thống kê ───────────────────────────────────────────

  public async follow(campaignId: string, userId: string): Promise<boolean> {
    const rows = await this.manager.query<{ campaign_id: string }[]>(
      `INSERT INTO campaign_follows (campaign_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING campaign_id`,
      [campaignId, userId],
    );
    return rows.length > 0;
  }

  public async unfollow(campaignId: string, userId: string): Promise<boolean> {
    const rows = await updateReturning<{ campaign_id: string }>(
      this.manager,
      `DELETE FROM campaign_follows WHERE campaign_id = $1 AND user_id = $2
       RETURNING campaign_id`,
      [campaignId, userId],
    );
    return rows.length > 0;
  }

  public async isFollowing(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.manager.query<{ ok: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM campaign_follows WHERE campaign_id = $1 AND user_id = $2) AS ok`,
      [campaignId, userId],
    );
    return row?.ok === true;
  }

  public async counters(
    campaignId: string,
  ): Promise<ICharityEngagementCounters> {
    // Đếm thẳng từ bảng gốc như chủ đề Diễn đàn: không có cột đếm nào để lệch. Chỉ bình
    // luận `VISIBLE` được tính — con số người ngoài thấy phải khớp danh sách họ mở ra.
    const [row] = await this.manager.query<
      { reactions: string; comments: string; followers: string }[]
    >(
      `SELECT
         (SELECT count(*) FROM content_reactions
           WHERE subject_type = 'CHARITY_CAMPAIGN' AND subject_id = $1) AS reactions,
         (SELECT count(*) FROM content_comments
           WHERE subject_type = 'CHARITY_CAMPAIGN' AND subject_id = $1
             AND status = 'VISIBLE') AS comments,
         (SELECT count(*) FROM campaign_follows WHERE campaign_id = $1) AS followers`,
      [campaignId],
    );
    return {
      reactionCount: num(row?.reactions),
      commentCount: num(row?.comments),
      followerCount: num(row?.followers),
    };
  }

  public async internalStats(
    campaignId: string,
  ): Promise<ICharityInternalStats> {
    const [counters, [row]] = await Promise.all([
      this.counters(campaignId),
      this.manager.query<Record<string, string>[]>(
        `SELECT
           count(*) FILTER (WHERE contribution.status = 'PENDING_REVIEW') AS pending_review,
           count(*) FILTER (WHERE contribution.status = 'ACCEPTED') AS accepted,
           count(*) FILTER (WHERE contribution.status = 'PARTIALLY_ACCEPTED') AS partially_accepted,
           count(*) FILTER (WHERE contribution.status = 'REJECTED') AS rejected,
           count(*) FILTER (WHERE contribution.status = 'WITHDRAWN') AS withdrawn,
           count(DISTINCT contribution.contributor_id) FILTER (
             WHERE contribution.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')) AS accepted_contributors,
           (SELECT count(*) FROM campaign_participations
             WHERE campaign_id = $1 AND status = 'REGISTERED') AS participants_registered,
           (SELECT count(*) FROM campaign_participations
             WHERE campaign_id = $1 AND status = 'CANCELLED') AS participants_cancelled,
           (SELECT count(*) FILTER (WHERE registration.status = 'REGISTERED')
              FROM campaign_volunteer_registrations registration
              JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
             WHERE need.campaign_id = $1) AS volunteers_registered,
           (SELECT count(*) FILTER (WHERE registration.status = 'CONFIRMED')
              FROM campaign_volunteer_registrations registration
              JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
             WHERE need.campaign_id = $1) AS volunteers_confirmed,
           (SELECT count(*) FILTER (WHERE registration.status = 'CANCELLED')
              FROM campaign_volunteer_registrations registration
              JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
             WHERE need.campaign_id = $1) AS volunteers_cancelled,
           (SELECT count(*) FILTER (WHERE status IN ('PENDING', 'IN_REVIEW')) FROM reports
             WHERE target_type = 'CHARITY_CAMPAIGN' AND target_id = $1) AS reports_open,
           (SELECT count(*) FROM reports
             WHERE target_type = 'CHARITY_CAMPAIGN' AND target_id = $1) AS reports_total,
           (SELECT count(*) FROM content_shares
             WHERE subject_type = 'CHARITY_CAMPAIGN' AND subject_id = $1) AS shares
         FROM campaign_contributions contribution
         WHERE contribution.campaign_id = $1`,
        [campaignId],
      ),
    ]);
    return {
      ...counters,
      contributions: {
        pendingReview: num(row?.pending_review),
        accepted: num(row?.accepted),
        partiallyAccepted: num(row?.partially_accepted),
        rejected: num(row?.rejected),
        withdrawn: num(row?.withdrawn),
        acceptedContributors: num(row?.accepted_contributors),
      },
      participants: {
        registered: num(row?.participants_registered),
        cancelled: num(row?.participants_cancelled),
      },
      volunteers: {
        registered: num(row?.volunteers_registered),
        confirmed: num(row?.volunteers_confirmed),
        cancelled: num(row?.volunteers_cancelled),
      },
      reports: {
        open: num(row?.reports_open),
        total: num(row?.reports_total),
      },
      shares: num(row?.shares),
    };
  }

  // ── Outbox thông báo ──────────────────────────────────────────────────

  public async enqueueAnnouncement(params: {
    campaignId: string;
    kind: CharityAnnouncementKind;
    payload: Record<string, unknown>;
    dedupeKey: string | null;
    actorId: string | null;
  }): Promise<boolean> {
    const rows = await this.manager.query<{ id: string }[]>(
      `INSERT INTO campaign_announcements (campaign_id, kind, payload, dedupe_key, actor_id)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (campaign_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        params.campaignId,
        params.kind,
        JSON.stringify(params.payload),
        params.dedupeKey,
        params.actorId,
      ],
    );
    return rows.length > 0;
  }

  public async listPreEventCandidates(params: {
    hours: number;
    limit: number;
  }): Promise<ICharityPreEventCandidate[]> {
    // Khoá chống trùng là MỐC TRAO (mili giây) — dời giờ trao thì nhắc lại cho mốc mới.
    const rows = await this.manager.query<
      { global_id: string; starts_at: Date }[]
    >(
      `SELECT campaign.global_id, phase.starts_at
       FROM campaigns campaign
       JOIN campaign_phases phase
         ON phase.campaign_id = campaign.global_id AND phase.phase = 'DISTRIBUTION'
       WHERE campaign.approval_status = 'APPROVED'
         AND campaign.is_active
         AND campaign.deleted_at IS NULL
         AND phase.starts_at > now()
         AND phase.starts_at <= now() + make_interval(hours => $1::int)
         AND NOT EXISTS (
           SELECT 1 FROM campaign_announcements announcement
           WHERE announcement.campaign_id = campaign.global_id
             AND announcement.kind = 'PRE_EVENT'
             AND announcement.dedupe_key =
               floor(extract(epoch FROM phase.starts_at) * 1000)::bigint::text)
       ORDER BY phase.starts_at
       LIMIT $2`,
      [params.hours, params.limit],
    );
    return rows.map((row) => ({
      campaignId: row.global_id,
      distributionStartsAt: row.starts_at,
    }));
  }

  public async processPendingAnnouncements(
    limit: number,
    handler: (announcement: ICharityAnnouncement) => Promise<number>,
  ): Promise<number> {
    let processed = 0;
    while (processed < limit) {
      const done = await this.manager.transaction(async (manager) => {
        const [row] = await manager.query<
          {
            global_id: string;
            campaign_id: string;
            kind: CharityAnnouncementKind;
            payload: Record<string, unknown>;
            actor_id: string | null;
            created_at: Date;
          }[]
        >(
          `SELECT global_id, campaign_id, kind, payload, actor_id, created_at
           FROM campaign_announcements
           WHERE processed_at IS NULL
           ORDER BY id
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
        );
        if (!row) return false;
        const recipients = await handler({
          announcementId: row.global_id,
          campaignId: row.campaign_id,
          kind: row.kind,
          payload: row.payload,
          actorId: row.actor_id,
          createdAt: row.created_at,
        });
        await manager.query(
          `UPDATE campaign_announcements SET processed_at = now(), recipient_count = $2
           WHERE global_id = $1`,
          [row.global_id, recipients],
        );
        return true;
      });
      if (!done) break;
      processed += 1;
    }
    return processed;
  }

  public async listAudience(params: {
    campaignId: string;
    excludeUserId: string | null;
  }): Promise<string[]> {
    const rows = await this.manager.query<{ user_id: string }[]>(
      `SELECT DISTINCT audience.user_id
       FROM (
         SELECT user_id FROM campaign_participations
          WHERE campaign_id = $1 AND status = 'REGISTERED'
         UNION
         SELECT registration.user_id
           FROM campaign_volunteer_registrations registration
           JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
          WHERE need.campaign_id = $1 AND registration.status <> 'CANCELLED'
         UNION
         SELECT contributor_id FROM campaign_contributions
          WHERE campaign_id = $1 AND status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
         UNION
         SELECT user_id FROM campaign_follows WHERE campaign_id = $1
       ) audience
       JOIN users ON users.global_id = audience.user_id AND users.deleted_at IS NULL
       WHERE $2::uuid IS NULL OR audience.user_id <> $2::uuid
       ORDER BY audience.user_id`,
      [params.campaignId, params.excludeUserId],
    );
    return rows.map((row) => row.user_id);
  }

  // ── Bản in ────────────────────────────────────────────────────────────

  public async createExport(params: {
    campaignId: string;
    sectionKey: CharityOperationStage | null;
    snapshot: Record<string, unknown>;
    generatedBy: string;
  }): Promise<ICharityExport> {
    const [row] = await this.manager.query<IExportRow[]>(
      `INSERT INTO campaign_exports
         (campaign_id, section_key, snapshot, last_revision_id, generated_by)
       VALUES ($1, $2, $3::jsonb,
               (SELECT global_id FROM campaign_revisions
                 WHERE campaign_id = $1 ORDER BY id DESC LIMIT 1),
               $4)
       RETURNING global_id, campaign_id, section_key, snapshot, last_revision_id,
                 generated_by, generated_at`,
      [
        params.campaignId,
        params.sectionKey,
        JSON.stringify(params.snapshot),
        params.generatedBy,
      ],
    );
    return toExport(row);
  }

  public async findExport(
    campaignId: string,
    exportId: string,
  ): Promise<ICharityExport | null> {
    const [row] = await this.manager.query<IExportRow[]>(
      `SELECT global_id, campaign_id, section_key, snapshot, last_revision_id, generated_by,
              generated_at
       FROM campaign_exports WHERE campaign_id = $1 AND global_id = $2`,
      [campaignId, exportId],
    );
    return row ? toExport(row) : null;
  }

  public async listExports(
    campaignId: string,
    limit: number,
  ): Promise<ICharityExport[]> {
    const rows = await this.manager.query<IExportRow[]>(
      `SELECT global_id, campaign_id, section_key, snapshot, last_revision_id, generated_by,
              generated_at
       FROM campaign_exports WHERE campaign_id = $1
       ORDER BY generated_at DESC, id DESC LIMIT $2`,
      [campaignId, limit],
    );
    return rows.map(toExport);
  }
}
