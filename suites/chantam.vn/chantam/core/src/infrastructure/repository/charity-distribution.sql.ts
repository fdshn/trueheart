import { ICharityCampaignDistributionInput } from '@/domain/ports/repository';
import { EntityManager } from 'typeorm';

/**
 * Các mảnh SQL dùng chung của bước trao ở cấp chiến dịch (CR 22/11/2026: đã bỏ đợt trao).
 */

/** Giá trị quy đổi hiện vật đã xác nhận của MỘT lượt giao nhận. */
export const confirmedDeliveryValueSql = (deliveryAlias: string): string => `
  COALESCE(${deliveryAlias}.confirmed_value_adjusted,
    (SELECT COALESCE(SUM(item.confirmed_value), 0)
       FROM campaign_delivery_items item
      WHERE item.delivery_id = ${deliveryAlias}.global_id))`;

/** Tổng giá trị quy đổi hiện vật đã xác nhận của chiến dịch (alias `campaigns`). */
export const CampaignConfirmedValueSql = `
  (SELECT COALESCE(SUM(${confirmedDeliveryValueSql('delivery')}), 0)
     FROM campaign_deliveries delivery
    WHERE delivery.campaign_id = campaigns.global_id AND delivery.status = 'COMPLETED')`;

/**
 * Bằng chứng trao đúng hình thức: hình thức NULL (chiến dịch cũ) luôn đủ; còn lại cần ≥ 1 ảnh,
 * SHIPPING cần thêm mã vận đơn.
 */
export const CampaignDistributionEvidenceOkSql = (
  campaignAlias: string,
): string => `
  (${campaignAlias}.distribution_method IS NULL OR (
     jsonb_array_length(${campaignAlias}.distribution_evidence_urls) > 0
     AND (${campaignAlias}.distribution_method <> 'SHIPPING' OR EXISTS (
       SELECT 1 FROM campaign_distribution_private_details detail
        WHERE detail.campaign_id = ${campaignAlias}.global_id
          AND length(btrim(coalesce(detail.tracking_code, ''))) > 0))))`;

/**
 * Tài khoản thụ hưởng hợp lệ: chỉ BANK_TRANSFER cần — tài khoản gắn với chiến dịch còn hiệu
 * lực, cùng chiến dịch, đã xác thực.
 */
export const CampaignBeneficiaryAccountOkSql = (
  campaignAlias: string,
): string => `
  (${campaignAlias}.distribution_method IS DISTINCT FROM 'BANK_TRANSFER' OR EXISTS (
     SELECT 1 FROM campaign_distribution_private_details detail
       JOIN campaign_beneficiary_bank_accounts account
         ON account.global_id = detail.beneficiary_bank_account_id
      WHERE detail.campaign_id = ${campaignAlias}.global_id
        AND account.campaign_id = ${campaignAlias}.global_id
        AND account.valid_to IS NULL
        AND account.verified_at IS NOT NULL))`;

/**
 * Bước trao của chiến dịch đã hoàn tất chưa — cùng luật với `charityDistributionSettled` ở
 * core-lib (đủ bằng chứng + tài khoản thụ hưởng hợp lệ).
 */
export const CampaignDistributionSettledSql = (campaignAlias: string): string =>
  `(${CampaignDistributionEvidenceOkSql(campaignAlias)} AND ${CampaignBeneficiaryAccountOkSql(campaignAlias)})`;

/** Tổng duyệt đã READY. */
export const CampaignRehearsalReadySql = (campaignAlias: string): string => `
  EXISTS (SELECT 1 FROM campaign_rehearsals rehearsal
           WHERE rehearsal.campaign_id = ${campaignAlias}.global_id
             AND rehearsal.outcome = 'READY')`;

/**
 * Ghi hình thức trao của chiến dịch: cột trên `campaigns` + dòng riêng tư 1-1 (upsert).
 * Chạy trong manager/transaction của nơi gọi (tạo chiến dịch, `PUT :id/distribution`).
 */
export async function writeCampaignDistribution(
  manager: EntityManager,
  params: {
    campaignId: string;
    actorId: string;
    distribution: ICharityCampaignDistributionInput;
  },
): Promise<void> {
  const distribution = params.distribution;
  const detail = distribution.privateDetails;
  await manager.query(
    `UPDATE campaigns
        SET distribution_method = $2,
            distribution_contribution_types = $3::text[],
            distribution_service_type = $4,
            distribution_service_channel = $5,
            updated_at = now()
      WHERE global_id = $1`,
    [
      params.campaignId,
      distribution.distributionMethod,
      [...distribution.contributionTypes],
      distribution.serviceType,
      distribution.serviceChannel,
    ],
  );
  await manager.query(
    `INSERT INTO campaign_distribution_private_details
       (campaign_id, beneficiary_bank_account_id, recipient_name, recipient_phone,
        recipient_address, coordinator_name, coordinator_phone, carrier, shipping_fee_payer,
        estimated_shipping_fee, tracking_code, transfer_content, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (campaign_id) DO UPDATE
       SET beneficiary_bank_account_id = EXCLUDED.beneficiary_bank_account_id,
           recipient_name = EXCLUDED.recipient_name,
           recipient_phone = EXCLUDED.recipient_phone,
           recipient_address = EXCLUDED.recipient_address,
           coordinator_name = EXCLUDED.coordinator_name,
           coordinator_phone = EXCLUDED.coordinator_phone,
           carrier = EXCLUDED.carrier,
           shipping_fee_payer = EXCLUDED.shipping_fee_payer,
           estimated_shipping_fee = EXCLUDED.estimated_shipping_fee,
           tracking_code = EXCLUDED.tracking_code,
           transfer_content = EXCLUDED.transfer_content,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [
      params.campaignId,
      detail.beneficiaryBankAccountId,
      detail.recipientName,
      detail.recipientPhone,
      detail.recipientAddress,
      detail.coordinatorName,
      detail.coordinatorPhone,
      detail.carrier,
      detail.shippingFeePayer,
      detail.estimatedShippingFee,
      detail.trackingCode,
      detail.transferContent,
      params.actorId,
    ],
  );
}
