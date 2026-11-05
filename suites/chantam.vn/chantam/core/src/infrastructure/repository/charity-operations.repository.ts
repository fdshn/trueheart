import {
  ICharityContributionParties,
  ICharityDispute,
  ICharityOperationsRepository,
  ICharityRound,
  ICharityRoundInput,
  ICharityRoundPreEventCandidate,
  ICharitySupportNeed,
  ICharitySupportNeedExternal,
  ICharitySupportNeedInput,
  ICharitySupportOffer,
} from '@/domain/ports/repository';
import {
  CharityCompletionBlocker,
  CharityDisputeParty,
  CharityDisputeReason,
  CharityDisputeStatus,
  CharityEventStepKeys,
  CharityRoundReadiness,
  CharityRoundStatus,
  CharitySupportOfferStatus,
  CharitySupportType,
  ICharityRoundChecklistItem,
  normalizeRoundChecklist,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { isUniqueViolationOn } from './unique-violation';
import { updateReturning } from './update-returning';

interface IDisputeRow {
  global_id: string;
  campaign_id: string;
  contribution_id: string;
  contributor_id: string;
  opened_by: string;
  opened_by_party: CharityDisputeParty;
  reason: CharityDisputeReason;
  description: string;
  evidence_urls: string[];
  status: CharityDisputeStatus;
  resolution: string | null;
  closed_by: string | null;
  closed_at: Date | null;
  created_at: Date;
}

const DisputeSelect = `
  SELECT dispute.global_id, dispute.campaign_id, dispute.contribution_id,
         contribution.contributor_id, dispute.opened_by, dispute.opened_by_party, dispute.reason,
         dispute.description, dispute.evidence_urls, dispute.status, dispute.resolution,
         dispute.closed_by, dispute.closed_at, dispute.created_at
  FROM campaign_contribution_disputes dispute
  JOIN campaign_contributions contribution
    ON contribution.global_id = dispute.contribution_id`;

const toDispute = (row: IDisputeRow): ICharityDispute => ({
  disputeId: row.global_id,
  campaignId: row.campaign_id,
  contributionId: row.contribution_id,
  contributorId: row.contributor_id,
  openedBy: row.opened_by,
  openedByParty: row.opened_by_party,
  reason: row.reason,
  description: row.description,
  evidenceUrls: row.evidence_urls ?? [],
  status: row.status,
  resolution: row.resolution,
  closedBy: row.closed_by,
  closedAt: row.closed_at,
  createdAt: row.created_at,
});

interface ISupportNeedRow {
  global_id: string;
  campaign_id: string;
  support_type: CharitySupportType;
  title: string;
  description: string | null;
  unit: string;
  target_quantity: number;
  starts_at: Date | null;
  ends_at: Date | null;
  location_label: string | null;
  requirements: string | null;
  handover_method: string | null;
  pic_name: string | null;
  pic_phone: string | null;
  sort_order: number;
  status: 'OPEN' | 'CLOSED';
  external_quantity: number;
  external_evidence_urls: string[];
  external_note: string | null;
  pending_quantity: string | number;
  accepted_quantity: string | number;
  completed_quantity: string | number;
  offer_count: string | number;
  updated_at: Date;
}

const SupportNeedSelect = `
  SELECT need.global_id, need.campaign_id, need.support_type, need.title, need.description,
         need.unit, need.target_quantity, need.starts_at, need.ends_at, need.location_label,
         need.requirements, need.handover_method, need.pic_name, need.pic_phone, need.sort_order,
         need.status, need.external_quantity, need.external_evidence_urls, need.external_note,
         need.updated_at,
         COALESCE(SUM(offer.quantity) FILTER (WHERE offer.status = 'PENDING'), 0) AS pending_quantity,
         COALESCE(SUM(offer.quantity) FILTER (WHERE offer.status = 'ACCEPTED'), 0) AS accepted_quantity,
         COALESCE(SUM(offer.completed_quantity) FILTER (WHERE offer.status = 'COMPLETED'), 0)
           AS completed_quantity,
         count(offer.id) AS offer_count
  FROM campaign_other_support_needs need
  LEFT JOIN campaign_other_support_offers offer ON offer.need_id = need.global_id`;

const toSupportNeed = (row: ISupportNeedRow): ICharitySupportNeed => {
  const completed = Number(row.completed_quantity);
  return {
    supportNeedId: row.global_id,
    campaignId: row.campaign_id,
    supportType: row.support_type,
    title: row.title,
    description: row.description,
    unit: row.unit,
    targetQuantity: row.target_quantity,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationLabel: row.location_label,
    requirements: row.requirements,
    handoverMethod: row.handover_method,
    picName: row.pic_name,
    picPhone: row.pic_phone,
    sortOrder: row.sort_order,
    status: row.status,
    external: {
      quantity: row.external_quantity,
      evidenceUrls: row.external_evidence_urls ?? [],
      note: row.external_note,
    },
    pendingQuantity: Number(row.pending_quantity),
    acceptedQuantity: Number(row.accepted_quantity),
    completedQuantity: completed,
    remainingQuantity: Math.max(
      0,
      row.target_quantity - completed - row.external_quantity,
    ),
    offerCount: Number(row.offer_count),
    updatedAt: row.updated_at,
  };
};

interface IOfferRow {
  global_id: string;
  need_id: string;
  campaign_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  quantity: number;
  completed_quantity: number | null;
  note: string | null;
  status: CharitySupportOfferStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  created_at: Date;
}

const OfferSelect = `
  SELECT offer.global_id, offer.need_id, need.campaign_id, offer.user_id, account.username,
         account.full_name, account.avatar_url, offer.quantity, offer.completed_quantity,
         offer.note, offer.status, offer.decided_by, offer.decided_at, offer.decision_reason,
         offer.created_at
  FROM campaign_other_support_offers offer
  JOIN campaign_other_support_needs need ON need.global_id = offer.need_id
  JOIN users account ON account.global_id = offer.user_id`;

const toOffer = (row: IOfferRow): ICharitySupportOffer => ({
  offerId: row.global_id,
  supportNeedId: row.need_id,
  campaignId: row.campaign_id,
  user: {
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  },
  quantity: row.quantity,
  completedQuantity: row.completed_quantity,
  note: row.note,
  status: row.status,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  decisionReason: row.decision_reason,
  createdAt: row.created_at,
});

interface IRoundRow {
  global_id: string;
  campaign_id: string;
  title: string;
  location_label: string | null;
  address: string | null;
  starts_at: Date;
  ends_at: Date;
  status: CharityRoundStatus;
  status_reason: string | null;
  readiness: CharityRoundReadiness;
  readiness_note: string | null;
  readiness_by: string | null;
  readiness_at: Date | null;
  checklist: Partial<ICharityRoundChecklistItem>[];
  updated_at: Date;
  participant_count: string | number;
  attended_count: string | number;
  delivery_count: string | number;
  completed_delivery_count: string | number;
  confirmed_value: string | number;
}

const RoundSelect = `
  SELECT round.global_id, round.campaign_id, round.title, round.location_label, round.address,
         round.starts_at, round.ends_at, round.status, round.status_reason, round.readiness,
         round.readiness_note, round.readiness_by, round.readiness_at, round.checklist,
         round.updated_at,
         (SELECT count(*) FROM campaign_participations participation
           WHERE participation.round_id = round.global_id
             AND participation.status IN
               ('REGISTERED', 'CONFIRMED', 'WAITLISTED', 'CHECKED_IN', 'COMPLETED'))
           AS participant_count,
         (SELECT count(*) FROM campaign_participations participation
           WHERE participation.round_id = round.global_id
             AND participation.status IN ('CHECKED_IN', 'COMPLETED')) AS attended_count,
         (SELECT count(*) FROM campaign_deliveries delivery
           WHERE delivery.round_id = round.global_id AND delivery.status <> 'CANCELLED')
           AS delivery_count,
         (SELECT count(*) FROM campaign_deliveries delivery
           WHERE delivery.round_id = round.global_id AND delivery.status = 'COMPLETED')
           AS completed_delivery_count,
         (SELECT COALESCE(SUM(COALESCE(delivery.confirmed_value_adjusted,
                   (SELECT COALESCE(SUM(item.confirmed_value), 0)
                      FROM campaign_delivery_items item
                     WHERE item.delivery_id = delivery.global_id))), 0)
            FROM campaign_deliveries delivery
           WHERE delivery.round_id = round.global_id AND delivery.status = 'COMPLETED')
           AS confirmed_value
  FROM campaign_distribution_rounds round`;

const toRound = (row: IRoundRow): ICharityRound => ({
  roundId: row.global_id,
  campaignId: row.campaign_id,
  title: row.title,
  locationLabel: row.location_label,
  address: row.address,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  statusReason: row.status_reason,
  readiness: row.readiness,
  readinessNote: row.readiness_note,
  readinessBy: row.readiness_by,
  readinessAt: row.readiness_at,
  checklist: normalizeRoundChecklist(row.checklist),
  stats: {
    participantCount: Number(row.participant_count),
    attendedCount: Number(row.attended_count),
    deliveryCount: Number(row.delivery_count),
    completedDeliveryCount: Number(row.completed_delivery_count),
    confirmedValue: Number(row.confirmed_value),
  },
  updatedAt: row.updated_at,
});

@Injectable()
export class CharityOperationsRepository implements ICharityOperationsRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  // ── Hỗ trợ mở ─────────────────────────────────────────────────────────

  public async listSupportNeeds(
    campaignId: string,
  ): Promise<ICharitySupportNeed[]> {
    const rows = await this.manager.query<ISupportNeedRow[]>(
      `${SupportNeedSelect}
       WHERE need.campaign_id = $1
       GROUP BY need.id
       ORDER BY need.sort_order, need.id`,
      [campaignId],
    );
    return rows.map(toSupportNeed);
  }

  public async findSupportNeed(
    campaignId: string,
    supportNeedId: string,
  ): Promise<ICharitySupportNeed | null> {
    const [row] = await this.manager.query<ISupportNeedRow[]>(
      `${SupportNeedSelect}
       WHERE need.campaign_id = $1 AND need.global_id = $2
       GROUP BY need.id`,
      [campaignId, supportNeedId],
    );
    return row ? toSupportNeed(row) : null;
  }

  public async createSupportNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharitySupportNeedInput;
  }): Promise<ICharitySupportNeed> {
    const need = params.need;
    const [row] = await this.manager.query<{ global_id: string }[]>(
      `INSERT INTO campaign_other_support_needs
         (campaign_id, support_type, title, description, unit, target_quantity, starts_at,
          ends_at, location_label, requirements, handover_method, pic_name, pic_phone,
          sort_order, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
       RETURNING global_id`,
      [
        params.campaignId,
        need.supportType,
        need.title,
        need.description,
        need.unit,
        need.targetQuantity,
        need.startsAt,
        need.endsAt,
        need.locationLabel,
        need.requirements,
        need.handoverMethod,
        need.picName,
        need.picPhone,
        need.sortOrder,
        params.actorId,
      ],
    );
    return (await this.findSupportNeed(
      params.campaignId,
      row.global_id,
    )) as ICharitySupportNeed;
  }

  public async updateSupportNeed(params: {
    campaignId: string;
    supportNeedId: string;
    actorId: string;
    need: ICharitySupportNeedInput;
    external: ICharitySupportNeedExternal;
    status: 'OPEN' | 'CLOSED';
  }): Promise<ICharitySupportNeed | null> {
    const need = params.need;
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_other_support_needs
          SET support_type = $3, title = $4, description = $5, unit = $6,
              target_quantity = $7, starts_at = $8, ends_at = $9, location_label = $10,
              requirements = $11, handover_method = $12, pic_name = $13, pic_phone = $14,
              sort_order = $15, external_quantity = $16, external_evidence_urls = $17::jsonb,
              external_note = $18, status = $19, updated_by = $20, updated_at = now()
        WHERE campaign_id = $1 AND global_id = $2
        RETURNING global_id`,
      [
        params.campaignId,
        params.supportNeedId,
        need.supportType,
        need.title,
        need.description,
        need.unit,
        need.targetQuantity,
        need.startsAt,
        need.endsAt,
        need.locationLabel,
        need.requirements,
        need.handoverMethod,
        need.picName,
        need.picPhone,
        need.sortOrder,
        params.external.quantity,
        JSON.stringify(params.external.evidenceUrls),
        params.external.note,
        params.status,
        params.actorId,
      ],
    );
    if (rows.length === 0) return null;
    return this.findSupportNeed(params.campaignId, params.supportNeedId);
  }

  public async deleteSupportNeed(
    campaignId: string,
    supportNeedId: string,
  ): Promise<'DELETED' | 'NOT_FOUND' | 'HAS_OFFERS'> {
    return this.manager.transaction(async (manager) => {
      const [need] = await manager.query<{ global_id: string }[]>(
        `SELECT global_id FROM campaign_other_support_needs
          WHERE campaign_id = $1 AND global_id = $2 FOR UPDATE`,
        [campaignId, supportNeedId],
      );
      if (!need) return 'NOT_FOUND';
      const [used] = await manager.query<unknown[]>(
        `SELECT 1 FROM campaign_other_support_offers WHERE need_id = $1 LIMIT 1`,
        [supportNeedId],
      );
      if (used) return 'HAS_OFFERS';
      await manager.query(
        `DELETE FROM campaign_other_support_needs WHERE global_id = $1`,
        [supportNeedId],
      );
      return 'DELETED';
    });
  }

  public async createOffer(params: {
    supportNeedId: string;
    userId: string;
    quantity: number;
    note: string | null;
  }): Promise<ICharitySupportOffer> {
    const [row] = await this.manager.query<{ global_id: string }[]>(
      `INSERT INTO campaign_other_support_offers (need_id, user_id, quantity, note)
       VALUES ($1, $2, $3, $4) RETURNING global_id`,
      [params.supportNeedId, params.userId, params.quantity, params.note],
    );
    const [offer] = await this.manager.query<IOfferRow[]>(
      `${OfferSelect} WHERE offer.global_id = $1`,
      [row.global_id],
    );
    return toOffer(offer);
  }

  public async listOffers(params: {
    campaignId: string;
    supportNeedId: string | null;
    userId: string | null;
  }): Promise<ICharitySupportOffer[]> {
    const rows = await this.manager.query<IOfferRow[]>(
      `${OfferSelect}
       WHERE need.campaign_id = $1
         AND ($2::uuid IS NULL OR offer.need_id = $2::uuid)
         AND ($3::uuid IS NULL OR offer.user_id = $3::uuid)
       ORDER BY offer.created_at, offer.id
       LIMIT 2000`,
      [params.campaignId, params.supportNeedId, params.userId],
    );
    return rows.map(toOffer);
  }

  public async findOffer(
    campaignId: string,
    offerId: string,
  ): Promise<ICharitySupportOffer | null> {
    const [row] = await this.manager.query<IOfferRow[]>(
      `${OfferSelect} WHERE need.campaign_id = $1 AND offer.global_id = $2`,
      [campaignId, offerId],
    );
    return row ? toOffer(row) : null;
  }

  public async transitionOffer(params: {
    campaignId: string;
    offerId: string;
    from: readonly CharitySupportOfferStatus[];
    to: CharitySupportOfferStatus;
    actorId: string | null;
    reason: string | null;
    completedQuantity: number | null;
  }): Promise<ICharitySupportOffer | null> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_other_support_offers offer
          SET status = $4::varchar, decided_by = $5, decided_at = now(),
              decision_reason = $6, completed_quantity = $7, updated_at = now()
         FROM campaign_other_support_needs need
        WHERE need.global_id = offer.need_id AND need.campaign_id = $1
          AND offer.global_id = $2 AND offer.status = ANY($3::varchar[])
        RETURNING offer.global_id`,
      [
        params.campaignId,
        params.offerId,
        [...params.from],
        params.to,
        params.actorId,
        params.reason,
        params.completedQuantity,
      ],
    );
    if (rows.length === 0) return null;
    return this.findOffer(params.campaignId, params.offerId);
  }

  // ── Đợt trao ──────────────────────────────────────────────────────────

  public async listRounds(campaignId: string): Promise<ICharityRound[]> {
    const rows = await this.manager.query<IRoundRow[]>(
      `${RoundSelect} WHERE round.campaign_id = $1 ORDER BY round.starts_at, round.id`,
      [campaignId],
    );
    return rows.map(toRound);
  }

  public async findRound(
    campaignId: string,
    roundId: string,
  ): Promise<ICharityRound | null> {
    const [row] = await this.manager.query<IRoundRow[]>(
      `${RoundSelect} WHERE round.campaign_id = $1 AND round.global_id = $2`,
      [campaignId, roundId],
    );
    return row ? toRound(row) : null;
  }

  public async createRound(params: {
    campaignId: string;
    actorId: string;
    round: ICharityRoundInput;
  }): Promise<ICharityRound> {
    const roundId = await this.manager.transaction(async (manager) => {
      const [row] = await manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_distribution_rounds
           (campaign_id, title, location_label, address, starts_at, ends_at, checklist,
            created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
         RETURNING global_id`,
        [
          params.campaignId,
          params.round.title,
          params.round.locationLabel,
          params.round.address,
          params.round.startsAt,
          params.round.endsAt,
          JSON.stringify(normalizeRoundChecklist([])),
          params.actorId,
        ],
      );
      // Mỗi đợt một timeline 10 bước riêng (§3.18).
      await manager.query(
        `INSERT INTO campaign_event_steps (campaign_id, round_id, step_key, sort_order)
         SELECT $1, $2, step.key, step.sort_order
         FROM unnest($3::text[], $4::int[]) AS step(key, sort_order)`,
        [
          params.campaignId,
          row.global_id,
          [...CharityEventStepKeys],
          CharityEventStepKeys.map((_, index) => index),
        ],
      );
      return row.global_id;
    });
    return (await this.findRound(params.campaignId, roundId)) as ICharityRound;
  }

  public async updateRound(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    round: ICharityRoundInput;
    reason: string | null;
    announce: boolean;
  }): Promise<ICharityRound | null> {
    const updated = await this.manager.transaction(async (manager) => {
      const [before] = await manager.query<
        { starts_at: Date; title: string }[]
      >(
        `SELECT starts_at, title FROM campaign_distribution_rounds
          WHERE campaign_id = $1 AND global_id = $2 AND status = 'PLANNED' FOR UPDATE`,
        [params.campaignId, params.roundId],
      );
      if (!before) return false;
      await manager.query(
        `UPDATE campaign_distribution_rounds
            SET title = $3, location_label = $4, address = $5, starts_at = $6, ends_at = $7,
                status_reason = COALESCE($8, status_reason), updated_by = $9, updated_at = now()
          WHERE campaign_id = $1 AND global_id = $2`,
        [
          params.campaignId,
          params.roundId,
          params.round.title,
          params.round.locationLabel,
          params.round.address,
          params.round.startsAt,
          params.round.endsAt,
          params.reason,
          params.actorId,
        ],
      );
      if (params.announce)
        await this.enqueueRoundChanged(manager, {
          campaignId: params.campaignId,
          roundId: params.roundId,
          title: params.round.title,
          change:
            params.round.startsAt.getTime() > before.starts_at.getTime()
              ? 'POSTPONED'
              : 'UPDATED',
          startsAt: params.round.startsAt,
          reason: params.reason,
          actorId: params.actorId,
        });
      return true;
    });
    return updated ? this.findRound(params.campaignId, params.roundId) : null;
  }

  public async setRoundStatus(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    status: 'DONE' | 'CANCELLED';
    reason: string | null;
  }): Promise<ICharityRound | null> {
    const updated = await this.manager.transaction(async (manager) => {
      const rows = await updateReturning<{ title: string; starts_at: Date }>(
        manager,
        `UPDATE campaign_distribution_rounds
            SET status = $3::varchar, status_reason = $4, updated_by = $5, updated_at = now()
          WHERE campaign_id = $1 AND global_id = $2 AND status = 'PLANNED'
          RETURNING title, starts_at`,
        [
          params.campaignId,
          params.roundId,
          params.status,
          params.reason,
          params.actorId,
        ],
      );
      if (rows.length === 0) return false;
      if (params.status === 'CANCELLED')
        await this.enqueueRoundChanged(manager, {
          campaignId: params.campaignId,
          roundId: params.roundId,
          title: rows[0].title,
          change: 'CANCELLED',
          startsAt: rows[0].starts_at,
          reason: params.reason,
          actorId: params.actorId,
        });
      return true;
    });
    return updated ? this.findRound(params.campaignId, params.roundId) : null;
  }

  public async setRoundReadiness(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    readiness: CharityRoundReadiness;
    note: string | null;
    checklist: ICharityRoundChecklistItem[];
  }): Promise<ICharityRound | null> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_distribution_rounds
          SET readiness = $3::varchar, readiness_note = $4, checklist = $5::jsonb,
              readiness_by = $6, readiness_at = now(), updated_at = now()
        WHERE campaign_id = $1 AND global_id = $2 AND status = 'PLANNED'
        RETURNING global_id`,
      [
        params.campaignId,
        params.roundId,
        params.readiness,
        params.note,
        JSON.stringify(params.checklist),
        params.actorId,
      ],
    );
    if (rows.length === 0) return null;
    return this.findRound(params.campaignId, params.roundId);
  }

  public async assignToRound(params: {
    campaignId: string;
    roundId: string | null;
    participationIds: string[];
    deliveryIds: string[];
  }): Promise<{ participations: number; deliveries: number }> {
    const participations =
      params.participationIds.length === 0
        ? []
        : await updateReturning<{ global_id: string }>(
            this.manager,
            `UPDATE campaign_participations SET round_id = $2::uuid
              WHERE campaign_id = $1 AND global_id = ANY($3::uuid[])
              RETURNING global_id`,
            [params.campaignId, params.roundId, params.participationIds],
          );
    const deliveries =
      params.deliveryIds.length === 0
        ? []
        : await updateReturning<{ global_id: string }>(
            this.manager,
            `UPDATE campaign_deliveries SET round_id = $2::uuid
              WHERE campaign_id = $1 AND global_id = ANY($3::uuid[])
              RETURNING global_id`,
            [params.campaignId, params.roundId, params.deliveryIds],
          );
    return {
      participations: participations.length,
      deliveries: deliveries.length,
    };
  }

  public async listRoundPreEventCandidates(params: {
    hours: number;
    limit: number;
  }): Promise<ICharityRoundPreEventCandidate[]> {
    // Khoá chống trùng là (đợt, mốc trao) — dời giờ thì nhắc lại cho mốc mới.
    const rows = await this.manager.query<
      {
        campaign_id: string;
        global_id: string;
        title: string;
        starts_at: Date;
      }[]
    >(
      `SELECT round.campaign_id, round.global_id, round.title, round.starts_at
       FROM campaign_distribution_rounds round
       JOIN campaigns campaign ON campaign.global_id = round.campaign_id
       WHERE round.status = 'PLANNED'
         AND campaign.approval_status = 'APPROVED'
         AND campaign.is_active
         AND campaign.deleted_at IS NULL
         AND round.starts_at > now()
         AND round.starts_at <= now() + make_interval(hours => $1::int)
         AND NOT EXISTS (
           SELECT 1 FROM campaign_announcements announcement
           WHERE announcement.campaign_id = round.campaign_id
             AND announcement.kind = 'PRE_EVENT'
             AND announcement.dedupe_key = 'round:' || round.global_id::text || ':' ||
               floor(extract(epoch FROM round.starts_at) * 1000)::bigint::text)
       ORDER BY round.starts_at
       LIMIT $2`,
      [params.hours, params.limit],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id,
      roundId: row.global_id,
      title: row.title,
      startsAt: row.starts_at,
    }));
  }

  public async hasRounds(campaignId: string): Promise<boolean> {
    const [row] = await this.manager.query<{ ok: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM campaign_distribution_rounds
                      WHERE campaign_id = $1 AND status <> 'CANCELLED') AS ok`,
      [campaignId],
    );
    return row?.ok === true;
  }

  // ── Tranh chấp đóng góp ───────────────────────────────────────────────

  public async findContributionParties(
    contributionId: string,
  ): Promise<ICharityContributionParties | null> {
    const [row] = await this.manager.query<
      {
        global_id: string;
        campaign_id: string;
        title: string;
        created_by: string;
        contributor_id: string;
        status: string;
      }[]
    >(
      `SELECT contribution.global_id, contribution.campaign_id, campaign.title,
              campaign.created_by, contribution.contributor_id, contribution.status
       FROM campaign_contributions contribution
       JOIN campaigns campaign ON campaign.global_id = contribution.campaign_id
       WHERE contribution.global_id = $1 AND campaign.deleted_at IS NULL`,
      [contributionId],
    );
    return row
      ? {
          contributionId: row.global_id,
          campaignId: row.campaign_id,
          campaignTitle: row.title,
          campaignCreatedBy: row.created_by,
          contributorId: row.contributor_id,
          status: row.status,
        }
      : null;
  }

  public async openDispute(params: {
    campaignId: string;
    contributionId: string;
    openedBy: string;
    party: CharityDisputeParty;
    reason: CharityDisputeReason;
    description: string;
    evidenceUrls: string[];
  }): Promise<ICharityDispute | 'ALREADY_OPEN'> {
    try {
      const [row] = await this.manager.query<{ global_id: string }[]>(
        `INSERT INTO campaign_contribution_disputes
           (campaign_id, contribution_id, opened_by, opened_by_party, reason, description,
            evidence_urls)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING global_id`,
        [
          params.campaignId,
          params.contributionId,
          params.openedBy,
          params.party,
          params.reason,
          params.description,
          JSON.stringify(params.evidenceUrls),
        ],
      );
      return (await this.findDispute(row.global_id)) as ICharityDispute;
    } catch (error) {
      if (isUniqueViolationOn(error, 'UQ_campaign_contribution_disputes_open'))
        return 'ALREADY_OPEN';
      throw error;
    }
  }

  public async findDispute(disputeId: string): Promise<ICharityDispute | null> {
    const [row] = await this.manager.query<IDisputeRow[]>(
      `${DisputeSelect} WHERE dispute.global_id = $1`,
      [disputeId],
    );
    return row ? toDispute(row) : null;
  }

  public async listDisputes(params: {
    campaignId: string | null;
    contributionId: string | null;
    status: CharityDisputeStatus | null;
  }): Promise<ICharityDispute[]> {
    const rows = await this.manager.query<IDisputeRow[]>(
      `${DisputeSelect}
       WHERE ($1::uuid IS NULL OR dispute.campaign_id = $1::uuid)
         AND ($2::uuid IS NULL OR dispute.contribution_id = $2::uuid)
         AND ($3::varchar IS NULL OR dispute.status = $3::varchar)
       ORDER BY dispute.created_at DESC, dispute.id DESC
       LIMIT 1000`,
      [params.campaignId, params.contributionId, params.status],
    );
    return rows.map(toDispute);
  }

  public async closeDispute(params: {
    disputeId: string;
    to: 'RESOLVED' | 'WITHDRAWN';
    actorId: string;
    resolution: string | null;
  }): Promise<ICharityDispute | null> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_contribution_disputes
          SET status = $2::varchar, resolution = $3, closed_by = $4, closed_at = now(),
              updated_at = now()
        WHERE global_id = $1 AND status = 'OPEN'
        RETURNING global_id`,
      [params.disputeId, params.to, params.resolution, params.actorId],
    );
    if (rows.length === 0) return null;
    return this.findDispute(params.disputeId);
  }

  // ── Hoàn tất dự án ────────────────────────────────────────────────────

  public async completionBlockers(
    campaignId: string,
  ): Promise<CharityCompletionBlocker[]> {
    const [row] = await this.manager.query<
      Record<CharityCompletionBlocker, boolean>[]
    >(
      `SELECT
         EXISTS (SELECT 1 FROM campaign_contributions
                  WHERE campaign_id = $1 AND status = 'PENDING_REVIEW') AS "CONTRIBUTIONS_PENDING",
         EXISTS (SELECT 1 FROM campaign_contribution_disputes
                  WHERE campaign_id = $1 AND status = 'OPEN') AS "CONTRIBUTIONS_DISPUTED",
         EXISTS (SELECT 1 FROM campaign_deliveries
                  WHERE campaign_id = $1 AND status = 'ACCEPTED') AS "DELIVERIES_UNSETTLED",
         (EXISTS (SELECT 1 FROM campaign_need_items
                   WHERE campaign_id = $1 AND is_active AND intake_status = 'OPEN')
          OR EXISTS (SELECT 1 FROM campaign_funding_needs
                      WHERE campaign_id = $1 AND status = 'OPEN')
          OR EXISTS (SELECT 1 FROM campaign_volunteer_needs
                      WHERE campaign_id = $1 AND status = 'OPEN')
          OR EXISTS (SELECT 1 FROM campaign_other_support_needs
                      WHERE campaign_id = $1 AND status = 'OPEN')) AS "NEEDS_OPEN",
         EXISTS (SELECT 1 FROM campaign_need_items
                  WHERE campaign_id = $1 AND received_quantity > target_quantity
                    AND length(btrim(coalesce(surplus_explanation, ''))) = 0)
           AS "SURPLUS_UNEXPLAINED",
         (EXISTS (SELECT 1 FROM campaign_funding_needs
                   WHERE campaign_id = $1 AND confirmed_amount + external_amount > 0)
          AND NOT EXISTS (SELECT 1 FROM campaign_financial_reports
                           WHERE campaign_id = $1
                             AND jsonb_array_length(statement_urls) > 0))
           AS "FINANCIAL_STATEMENT_MISSING",
         EXISTS (SELECT 1 FROM campaign_appeals
                  WHERE campaign_id = $1 AND status <> 'CLOSED') AS "APPEALS_OPEN",
         EXISTS (SELECT 1 FROM campaign_other_support_offers offer
                   JOIN campaign_other_support_needs need ON need.global_id = offer.need_id
                  WHERE need.campaign_id = $1 AND offer.status IN ('PENDING', 'ACCEPTED'))
           AS "SUPPORT_OFFERS_UNSETTLED",
         EXISTS (SELECT 1 FROM campaign_distribution_rounds
                  WHERE campaign_id = $1 AND status = 'PLANNED') AS "ROUNDS_UNSETTLED"`,
      [campaignId],
    );
    return (Object.keys(row ?? {}) as CharityCompletionBlocker[]).filter(
      (key) => row[key] === true,
    );
  }

  /** Xếp thông báo `ROUND_CHANGED` (outbox `charity:notify`) cho người của đợt. */
  private async enqueueRoundChanged(
    manager: EntityManager,
    params: {
      campaignId: string;
      roundId: string;
      title: string;
      change: 'POSTPONED' | 'UPDATED' | 'CANCELLED';
      startsAt: Date;
      reason: string | null;
      actorId: string;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO campaign_announcements (campaign_id, kind, payload, actor_id)
       SELECT $1, 'ROUND_CHANGED', $2::jsonb, $3
       FROM campaigns WHERE global_id = $1 AND approval_status = 'APPROVED'`,
      [
        params.campaignId,
        JSON.stringify({
          roundId: params.roundId,
          roundTitle: params.title,
          change: params.change,
          startsAt: params.startsAt.toISOString(),
          reason: params.reason,
        }),
        params.actorId,
      ],
    );
  }
}
