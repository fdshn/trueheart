import { ICharityRoundInput } from '@/domain/ports/repository';
import {
  CharityEventStepKeys,
  normalizeRoundChecklist,
} from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';

export const RoundConfirmedValueSql = `
  (SELECT COALESCE(SUM(COALESCE(delivery.confirmed_value_adjusted,
                (SELECT COALESCE(SUM(item.confirmed_value), 0)
                   FROM campaign_delivery_items item
                  WHERE item.delivery_id = delivery.global_id))), 0)
     FROM campaign_deliveries delivery
    WHERE delivery.round_id = round.global_id AND delivery.status = 'COMPLETED')`;

export async function insertDistributionRound(
  manager: EntityManager,
  params: { campaignId: string; actorId: string; round: ICharityRoundInput },
): Promise<string> {
  const { round } = params;
  const [created] = await manager.query<{ global_id: string }[]>(
    `INSERT INTO campaign_distribution_rounds
       (campaign_id, title, distribution_method, contribution_types, evidence_urls,
        location_label, address, location, needs_review, service_type, service_channel,
        starts_at, ends_at, checklist, created_by, updated_by)
     VALUES ($1, $2, $3, $4::text[], $5::jsonb, $6, $7,
             CASE WHEN $8::double precision IS NOT NULL AND $9::double precision IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography END,
             $10, $11, $12, $13, $14, $15::jsonb, $16, $16)
     RETURNING global_id`,
    [
      params.campaignId,
      round.title,
      round.distributionMethod,
      [...round.contributionTypes],
      JSON.stringify(round.evidenceUrls),
      round.locationLabel,
      round.address,
      round.lat,
      round.lng,
      round.needsReview,
      round.serviceType,
      round.serviceChannel,
      round.startsAt,
      round.endsAt,
      JSON.stringify(normalizeRoundChecklist([])),
      params.actorId,
    ],
  );
  await manager.query(
    `INSERT INTO campaign_round_private_details
       (round_id, campaign_id, beneficiary_bank_account_id, recipient_name, recipient_phone,
        recipient_address, coordinator_name, coordinator_phone, carrier, shipping_fee_payer,
        estimated_shipping_fee, tracking_code, transfer_content, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      created.global_id,
      params.campaignId,
      round.privateDetails.beneficiaryBankAccountId,
      round.privateDetails.recipientName,
      round.privateDetails.recipientPhone,
      round.privateDetails.recipientAddress,
      round.privateDetails.coordinatorName,
      round.privateDetails.coordinatorPhone,
      round.privateDetails.carrier,
      round.privateDetails.shippingFeePayer,
      round.privateDetails.estimatedShippingFee,
      round.privateDetails.trackingCode,
      round.privateDetails.transferContent,
      params.actorId,
    ],
  );
  await manager.query(
    `INSERT INTO campaign_event_steps (campaign_id, round_id, step_key, sort_order)
     SELECT $1, $2, step.key, step.sort_order
     FROM unnest($3::text[], $4::int[]) AS step(key, sort_order)`,
    [
      params.campaignId,
      created.global_id,
      [...CharityEventStepKeys],
      CharityEventStepKeys.map((_, index) => index),
    ],
  );
  return created.global_id;
}
