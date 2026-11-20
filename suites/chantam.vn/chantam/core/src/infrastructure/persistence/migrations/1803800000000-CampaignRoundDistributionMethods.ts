import { MigrationInterface, QueryRunner } from 'typeorm';

export class CampaignRoundDistributionMethods1803800000000 implements MigrationInterface {
  name = 'CampaignRoundDistributionMethods1803800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_distribution_rounds"
        ADD COLUMN "distribution_method" varchar(20),
        ADD COLUMN "contribution_types" text[] NOT NULL DEFAULT '{}'::text[],
        ADD COLUMN "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "needs_review" boolean NOT NULL DEFAULT false,
        ADD COLUMN "service_type" varchar(30),
        ADD COLUMN "service_channel" varchar(15),
        ADD COLUMN "location" geography(Point, 4326),
        ADD CONSTRAINT "CHK_campaign_distribution_rounds_distribution_method"
          CHECK ("distribution_method" IS NULL OR "distribution_method" IN
            ('DIRECT_RECIPIENT', 'SHIPPING', 'OTHER_LOCATION', 'BANK_TRANSFER', 'SERVICE')),
        ADD CONSTRAINT "CHK_campaign_distribution_rounds_contribution_types"
          CHECK ("contribution_types" <@ ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[]),
        ADD CONSTRAINT "CHK_campaign_distribution_rounds_evidence_urls"
          CHECK (jsonb_typeof("evidence_urls") = 'array' AND jsonb_array_length("evidence_urls") <= 20),
        ADD CONSTRAINT "CHK_campaign_distribution_rounds_service_channel"
          CHECK ("service_channel" IS NULL OR "service_channel" IN
            ('IN_PERSON', 'ONLINE', 'HOTLINE', 'APPOINTMENT'))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_distribution_rounds_location"
        ON "campaign_distribution_rounds" USING GIST ("location")
    `);
    await queryRunner.query(`
      CREATE TABLE "campaign_round_private_details" (
        "round_id" uuid PRIMARY KEY REFERENCES "campaign_distribution_rounds"("global_id") ON DELETE CASCADE,
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "recipient_name" varchar(200),
        "recipient_phone" varchar(30),
        "recipient_address" varchar(500),
        "coordinator_name" varchar(200),
        "coordinator_phone" varchar(30),
        "carrier" varchar(200),
        "shipping_fee_payer" varchar(12) CHECK ("shipping_fee_payer" IN ('ORGANIZER', 'RECIPIENT')),
        "estimated_shipping_fee" integer CHECK ("estimated_shipping_fee" >= 0 AND "estimated_shipping_fee" <= 10000000),
        "tracking_code" varchar(100),
        "transfer_content" varchar(200),
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      UPDATE "campaign_distribution_rounds" round
         SET "distribution_method" = CASE phase."delivery_method"
           WHEN 'SHIP' THEN 'SHIPPING'
           WHEN 'TRANSFER' THEN 'BANK_TRANSFER'
           WHEN 'ON_SITE' THEN 'OTHER_LOCATION'
         END,
             "needs_review" = phase."delivery_method" = 'ON_SITE'
        FROM "campaign_phases" phase
       WHERE phase."campaign_id" = round."campaign_id"
         AND phase."phase" = 'DISTRIBUTION'
         AND phase."delivery_method" IN ('SHIP', 'TRANSFER', 'ON_SITE')
         AND (SELECT count(*) FROM "campaign_distribution_rounds" candidate
              WHERE candidate."campaign_id" = round."campaign_id") = 1
         AND (SELECT count(*) FROM "campaign_distribution_rounds" candidate
              WHERE candidate."campaign_id" = round."campaign_id"
                AND candidate."distribution_method" IS NULL) = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "campaign_round_private_details"`);
    await queryRunner.query(
      `DROP INDEX "IDX_campaign_distribution_rounds_location"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_distribution_rounds"
        DROP CONSTRAINT "CHK_campaign_distribution_rounds_service_channel",
        DROP CONSTRAINT "CHK_campaign_distribution_rounds_evidence_urls",
        DROP CONSTRAINT "CHK_campaign_distribution_rounds_contribution_types",
        DROP CONSTRAINT "CHK_campaign_distribution_rounds_distribution_method",
        DROP COLUMN "location",
        DROP COLUMN "service_channel",
        DROP COLUMN "service_type",
        DROP COLUMN "needs_review",
        DROP COLUMN "evidence_urls",
        DROP COLUMN "contribution_types",
        DROP COLUMN "distribution_method"
    `);
  }
}
