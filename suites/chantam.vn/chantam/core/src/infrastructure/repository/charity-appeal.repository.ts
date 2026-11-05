import {
  ICharityAppeal,
  ICharityAppealAdminView,
  ICharityAppealEvent,
  ICharityAppealRepository,
  ICharityAppealTransition,
  ICharityEvaluationTarget,
} from '@/domain/ports/repository';
import {
  CharityAppealOutcome,
  CharityAppealStatus,
  CharityAppealTargetType,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IAppealRow {
  global_id: string;
  campaign_id: string;
  campaign_title: string;
  appellant_id: string;
  appellant_username: string | null;
  target_type: CharityAppealTargetType;
  target_id: string;
  original_value: string | number;
  requested_value: string | number | null;
  description: string;
  evidence_urls: string[];
  status: CharityAppealStatus;
  tier: number;
  organizer_decision: 'ADJUST' | 'KEEP' | null;
  organizer_value: string | number | null;
  organizer_reason: string | null;
  organizer_decided_at: Date | null;
  admin_decision: 'ADJUST' | 'KEEP' | 'REJECT' | null;
  admin_value: string | number | null;
  admin_reason: string | null;
  admin_decided_at: Date | null;
  outcome: CharityAppealOutcome | null;
  organizer_due_at: Date;
  appellant_due_at: Date | null;
  created_at: Date;
  closed_at: Date | null;
}

const numOrNull = (value: string | number | null) =>
  value === null ? null : Number(value);

const toAppeal = (row: IAppealRow): ICharityAppeal => ({
  appealId: row.global_id,
  campaignId: row.campaign_id,
  campaignTitle: row.campaign_title,
  appellantId: row.appellant_id,
  appellantUsername: row.appellant_username,
  targetType: row.target_type,
  targetId: row.target_id,
  originalValue: Number(row.original_value),
  requestedValue: numOrNull(row.requested_value),
  description: row.description,
  evidenceUrls: row.evidence_urls ?? [],
  status: row.status,
  tier: row.tier === 2 ? 2 : 1,
  organizerDecision: row.organizer_decision,
  organizerValue: numOrNull(row.organizer_value),
  organizerReason: row.organizer_reason,
  organizerDecidedAt: row.organizer_decided_at,
  adminDecision: row.admin_decision,
  adminValue: numOrNull(row.admin_value),
  adminReason: row.admin_reason,
  adminDecidedAt: row.admin_decided_at,
  outcome: row.outcome,
  organizerDueAt: row.organizer_due_at,
  appellantDueAt: row.appellant_due_at,
  createdAt: row.created_at,
  closedAt: row.closed_at,
});

const AppealSelect = `
  SELECT appeal.global_id, appeal.campaign_id, campaign.title AS campaign_title,
         appeal.appellant_id, appellant.username AS appellant_username, appeal.target_type,
         appeal.target_id, appeal.original_value, appeal.requested_value, appeal.description,
         appeal.evidence_urls, appeal.status, appeal.tier, appeal.organizer_decision,
         appeal.organizer_value, appeal.organizer_reason, appeal.organizer_decided_at,
         appeal.admin_decision, appeal.admin_value, appeal.admin_reason,
         appeal.admin_decided_at, appeal.outcome, appeal.organizer_due_at,
         appeal.appellant_due_at, appeal.created_at, appeal.closed_at
  FROM campaign_appeals appeal
  JOIN campaigns campaign ON campaign.global_id = appeal.campaign_id
  LEFT JOIN users appellant ON appellant.global_id = appeal.appellant_id`;

/** Khiếu nại hai tầng (CHARITY-PROJECT-LIFECYCLE §3.16). */
@Injectable()
export class CharityAppealRepository implements ICharityAppealRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async create(params: {
    campaignId: string;
    appellantId: string;
    targetType: CharityAppealTargetType;
    targetId: string;
    originalValue: number;
    requestedValue: number | null;
    description: string;
    evidenceUrls: string[];
    organizerDueAt: Date;
  }): Promise<ICharityAppeal | 'DUPLICATED'> {
    const id = await this.manager.transaction(async (manager) => {
      const [row] = await manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_appeals
           (campaign_id, appellant_id, target_type, target_id, original_value, requested_value,
            description, evidence_urls, organizer_due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         ON CONFLICT (target_type, target_id) DO NOTHING
         RETURNING global_id`,
        [
          params.campaignId,
          params.appellantId,
          params.targetType,
          params.targetId,
          params.originalValue,
          params.requestedValue,
          params.description,
          JSON.stringify(params.evidenceUrls),
          params.organizerDueAt,
        ],
      );
      if (!row) return null;
      await manager.query(
        `INSERT INTO campaign_appeal_events (appeal_id, actor_id, action, to_status, value, reason)
         VALUES ($1, $2, 'SUBMIT', 'ORGANIZER_REVIEW', $3, $4)`,
        [
          row.global_id,
          params.appellantId,
          params.requestedValue,
          params.description,
        ],
      );
      return row.global_id;
    });
    return id ? (await this.find(id))! : 'DUPLICATED';
  }

  public async find(appealId: string): Promise<ICharityAppeal | null> {
    const [row] = await this.manager.query<IAppealRow[]>(
      `${AppealSelect} WHERE appeal.global_id = $1`,
      [appealId],
    );
    return row ? toAppeal(row) : null;
  }

  public async listEvents(appealId: string): Promise<ICharityAppealEvent[]> {
    const rows = await this.manager.query<
      {
        actor_id: string | null;
        action: string;
        from_status: CharityAppealStatus | null;
        to_status: CharityAppealStatus;
        value: string | number | null;
        reason: string | null;
        created_at: Date;
      }[]
    >(
      `SELECT actor_id, action, from_status, to_status, value, reason, created_at
       FROM campaign_appeal_events WHERE appeal_id = $1 ORDER BY id`,
      [appealId],
    );
    return rows.map((row) => ({
      actorId: row.actor_id,
      action: row.action,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      value: numOrNull(row.value),
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  public async listByCampaign(campaignId: string): Promise<ICharityAppeal[]> {
    const rows = await this.manager.query<IAppealRow[]>(
      `${AppealSelect} WHERE appeal.campaign_id = $1 ORDER BY appeal.id DESC LIMIT 200`,
      [campaignId],
    );
    return rows.map(toAppeal);
  }

  public async listByAppellant(userId: string): Promise<ICharityAppeal[]> {
    const rows = await this.manager.query<IAppealRow[]>(
      `${AppealSelect} WHERE appeal.appellant_id = $1 ORDER BY appeal.id DESC LIMIT 200`,
      [userId],
    );
    return rows.map(toAppeal);
  }

  public async listForAdmin(params: {
    status: CharityAppealStatus | null;
    limit: number;
    offset: number;
  }): Promise<ICharityAppealAdminView[]> {
    // Hai con số §3.16 mục 7 — để Admin THẤY, không tự động phạt ai.
    const rows = await this.manager.query<
      (IAppealRow & {
        appellant_rejected: string;
        organizer_overturned: string;
      })[]
    >(
      `SELECT base.*,
              (SELECT count(*) FROM campaign_appeals other
                WHERE other.appellant_id = base.appellant_id
                  AND other.outcome = 'ADMIN_REJECTED') AS appellant_rejected,
              (SELECT count(*) FROM campaign_appeals other
                 JOIN campaigns other_campaign ON other_campaign.global_id = other.campaign_id
                WHERE other_campaign.created_by =
                        (SELECT created_by FROM campaigns WHERE global_id = base.campaign_id)
                  AND other.outcome IN ('ADJUSTED_ACCEPTED', 'ADMIN_ADJUSTED')) AS organizer_overturned
       FROM (${AppealSelect}
             WHERE ($1::varchar IS NULL OR appeal.status = $1::varchar)
             ORDER BY appeal.id DESC
             LIMIT $2 OFFSET $3) base`,
      [params.status, params.limit, params.offset],
    );
    return rows.map((row) => ({
      ...toAppeal(row),
      appellantRejectedCount: Number(row.appellant_rejected),
      organizerOverturnedCount: Number(row.organizer_overturned),
    }));
  }

  public async countSince(appellantId: string, since: Date): Promise<number> {
    const [row] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM campaign_appeals
       WHERE appellant_id = $1 AND created_at >= $2`,
      [appellantId, since],
    );
    return row?.total ?? 0;
  }

  public async transition(
    params: ICharityAppealTransition,
  ): Promise<ICharityAppeal | null> {
    const updated = await this.manager.transaction(async (manager) => {
      const closing = params.next === 'CLOSED';
      const rows = await updateReturning<{ global_id: string }>(
        manager,
        `UPDATE campaign_appeals SET
           status = $3,
           tier = COALESCE($4::smallint, tier),
           organizer_decision = COALESCE($5::varchar, organizer_decision),
           organizer_value = CASE WHEN $5::varchar IS NOT NULL THEN $6::bigint ELSE organizer_value END,
           organizer_reason = CASE WHEN $5::varchar IS NOT NULL THEN $7::varchar ELSE organizer_reason END,
           organizer_decided_by = CASE WHEN $5::varchar IS NOT NULL THEN $8::uuid ELSE organizer_decided_by END,
           organizer_decided_at = CASE WHEN $5::varchar IS NOT NULL THEN now() ELSE organizer_decided_at END,
           admin_decision = COALESCE($9::varchar, admin_decision),
           admin_value = CASE WHEN $9::varchar IS NOT NULL THEN $10::bigint ELSE admin_value END,
           admin_reason = CASE WHEN $9::varchar IS NOT NULL THEN $11::varchar ELSE admin_reason END,
           admin_decided_by = CASE WHEN $9::varchar IS NOT NULL THEN $12::uuid ELSE admin_decided_by END,
           admin_decided_at = CASE WHEN $9::varchar IS NOT NULL THEN now() ELSE admin_decided_at END,
           outcome = CASE WHEN $13::boolean THEN $14::varchar ELSE NULL END,
           closed_at = CASE WHEN $13::boolean THEN now() ELSE NULL END,
           appellant_due_at = $15::timestamptz,
           updated_at = now()
         WHERE global_id = $1 AND status = $2
         RETURNING global_id`,
        [
          params.appealId,
          params.expected,
          params.next,
          params.tier ?? null,
          params.organizerDecision ?? null,
          params.value,
          params.reason,
          params.actorId,
          params.adminDecision ?? null,
          params.value,
          params.reason,
          params.actorId,
          closing,
          params.outcome ?? null,
          params.appellantDueAt ?? null,
        ],
      );
      if (rows.length === 0) return null;
      await manager.query(
        `INSERT INTO campaign_appeal_events
           (appeal_id, actor_id, action, from_status, to_status, value, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          params.appealId,
          params.actorId,
          params.action,
          params.expected,
          params.next,
          params.value,
          params.reason,
        ],
      );
      return rows[0].global_id;
    });
    return updated ? this.find(updated) : null;
  }

  public async listOverdue(
    now: Date,
    limit: number,
  ): Promise<ICharityAppeal[]> {
    const rows = await this.manager.query<IAppealRow[]>(
      `${AppealSelect}
       WHERE (appeal.status = 'ORGANIZER_REVIEW' AND appeal.organizer_due_at <= $1)
          OR (appeal.status = 'AWAITING_APPELLANT' AND appeal.appellant_due_at <= $1)
       ORDER BY appeal.id LIMIT $2`,
      [now, limit],
    );
    return rows.map(toAppeal);
  }

  public async findEvaluationTarget(
    evaluationId: string,
  ): Promise<ICharityEvaluationTarget | null> {
    const [row] = await this.manager.query<
      {
        global_id: string;
        campaign_id: string;
        participant_id: string;
        completion_score: number;
        evaluated_by: string | null;
        created_at: Date;
        is_latest: boolean;
      }[]
    >(
      `SELECT evaluation.global_id, evaluation.campaign_id, evaluation.participant_id,
              evaluation.completion_score, evaluation.evaluated_by, evaluation.created_at,
              evaluation.id = (SELECT max(latest.id) FROM campaign_participant_evaluations latest
                               WHERE latest.campaign_id = evaluation.campaign_id
                                 AND latest.participant_id = evaluation.participant_id) AS is_latest
       FROM campaign_participant_evaluations evaluation WHERE evaluation.global_id = $1`,
      [evaluationId],
    );
    return row
      ? {
          evaluationId: row.global_id,
          campaignId: row.campaign_id,
          participantId: row.participant_id,
          completionScore: row.completion_score,
          evaluatedBy: row.evaluated_by,
          createdAt: row.created_at,
          isLatest: row.is_latest,
        }
      : null;
  }

  public async countOtherOperators(
    campaignId: string,
    exceptUserId: string,
  ): Promise<number> {
    const [row] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM (
         SELECT created_by AS user_id FROM campaigns WHERE global_id = $1
         UNION
         SELECT user_id FROM campaign_coordinators
          WHERE campaign_id = $1 AND revoked_at IS NULL
       ) operators
       WHERE operators.user_id IS NOT NULL AND operators.user_id <> $2`,
      [campaignId, exceptUserId],
    );
    return row?.total ?? 0;
  }
}
