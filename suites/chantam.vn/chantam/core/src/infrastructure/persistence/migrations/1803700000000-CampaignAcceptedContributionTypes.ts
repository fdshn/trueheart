import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ghi loại đóng góp mà một chiến dịch nhận. Dữ liệu cũ được suy từ các nhóm
 * nhu cầu đã tồn tại; hàng không có nhu cầu giữ mảng rỗng để không tự mở loại.
 */
export class CampaignAcceptedContributionTypes1803700000000 implements MigrationInterface {
  name = 'CampaignAcceptedContributionTypes1803700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "accepted_contribution_types" text[] NOT NULL
          DEFAULT ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[],
        ADD CONSTRAINT "CHK_campaigns_accepted_contribution_types"
          CHECK ("accepted_contribution_types" <@ ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[])
    `);
    await queryRunner.query(`
      UPDATE "campaigns" campaign
      SET "accepted_contribution_types" = array_remove(ARRAY[
        CASE WHEN EXISTS (
          SELECT 1 FROM "campaign_need_items" need
          WHERE need."campaign_id" = campaign."global_id"
        ) THEN 'MATERIAL' END,
        CASE WHEN EXISTS (
          SELECT 1 FROM "campaign_funding_needs" funding
          WHERE funding."campaign_id" = campaign."global_id"
        ) THEN 'MONEY' END,
        CASE WHEN EXISTS (
          SELECT 1 FROM "campaign_other_support_needs" support
          WHERE support."campaign_id" = campaign."global_id"
        ) THEN 'SERVICE' END
      ], NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT "CHK_campaigns_accepted_contribution_types",
        DROP COLUMN "accepted_contribution_types"
    `);
  }
}
