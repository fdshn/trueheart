import {
  ICharityCampaignDistribution,
  ICharityCampaignDistributionInput,
  ICharityContributionParties,
  ICharityDispute,
  ICharityOperationsRepository,
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
  CharitySupportOfferStatus,
  CharitySupportType,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { writeCampaignDistribution } from './charity-distribution.sql';
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

interface IDistributionRow {
  global_id: string;
  distribution_method: ICharityCampaignDistribution['distributionMethod'];
  distribution_contribution_types: ICharityCampaignDistribution['contributionTypes'];
  distribution_evidence_urls: string[] | null;
  distribution_service_type: ICharityCampaignDistribution['serviceType'];
  distribution_service_channel: ICharityCampaignDistribution['serviceChannel'];
  beneficiary_bank_account_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  carrier: string | null;
  shipping_fee_payer: ICharityCampaignDistribution['privateDetails']['shippingFeePayer'];
  estimated_shipping_fee: number | null;
  tracking_code: string | null;
  transfer_content: string | null;
  updated_at: Date | null;
}

const toDistribution = (
  row: IDistributionRow,
): ICharityCampaignDistribution => ({
  campaignId: row.global_id,
  distributionMethod: row.distribution_method,
  contributionTypes: row.distribution_contribution_types ?? [],
  serviceType: row.distribution_service_type,
  serviceChannel: row.distribution_service_channel,
  evidenceUrls: row.distribution_evidence_urls ?? [],
  privateDetails: {
    beneficiaryBankAccountId: row.beneficiary_bank_account_id,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    recipientAddress: row.recipient_address,
    coordinatorName: row.coordinator_name,
    coordinatorPhone: row.coordinator_phone,
    carrier: row.carrier,
    shippingFeePayer: row.shipping_fee_payer,
    estimatedShippingFee:
      row.estimated_shipping_fee === null
        ? null
        : Number(row.estimated_shipping_fee),
    trackingCode: row.tracking_code,
    transferContent: row.transfer_content,
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

  // ── Hình thức trao cấp chiến dịch ─────────────────────────────────────

  public async getDistribution(
    campaignId: string,
  ): Promise<ICharityCampaignDistribution | null> {
    const [row] = await this.manager.query<IDistributionRow[]>(
      `SELECT campaign.global_id, campaign.distribution_method,
              campaign.distribution_contribution_types, campaign.distribution_evidence_urls,
              campaign.distribution_service_type, campaign.distribution_service_channel,
              detail.beneficiary_bank_account_id, detail.recipient_name, detail.recipient_phone,
              detail.recipient_address, detail.coordinator_name, detail.coordinator_phone,
              detail.carrier, detail.shipping_fee_payer, detail.estimated_shipping_fee,
              detail.tracking_code, detail.transfer_content, detail.updated_at
         FROM campaigns campaign
         LEFT JOIN campaign_distribution_private_details detail
           ON detail.campaign_id = campaign.global_id
        WHERE campaign.global_id = $1 AND campaign.deleted_at IS NULL`,
      [campaignId],
    );
    return row ? toDistribution(row) : null;
  }

  public async saveDistribution(params: {
    campaignId: string;
    actorId: string;
    distribution: ICharityCampaignDistributionInput;
  }): Promise<ICharityCampaignDistribution> {
    await this.manager.transaction((manager) =>
      writeCampaignDistribution(manager, params),
    );
    return (await this.getDistribution(
      params.campaignId,
    )) as ICharityCampaignDistribution;
  }

  public async saveDistributionEvidence(params: {
    campaignId: string;
    actorId: string;
    evidenceUrls: string[];
  }): Promise<ICharityCampaignDistribution> {
    await this.manager.query(
      `UPDATE campaigns SET distribution_evidence_urls = $2::jsonb, updated_at = now()
        WHERE global_id = $1`,
      [params.campaignId, JSON.stringify(params.evidenceUrls)],
    );
    return (await this.getDistribution(
      params.campaignId,
    )) as ICharityCampaignDistribution;
  }

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
           AS "SUPPORT_OFFERS_UNSETTLED"`,
      [campaignId],
    );
    return (Object.keys(row ?? {}) as CharityCompletionBlocker[]).filter(
      (key) => row[key] === true,
    );
  }
}
