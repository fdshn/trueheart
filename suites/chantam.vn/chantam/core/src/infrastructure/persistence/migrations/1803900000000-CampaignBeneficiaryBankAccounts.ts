import { MigrationInterface, QueryRunner } from 'typeorm';

export class CampaignBeneficiaryBankAccounts1803900000000 implements MigrationInterface {
  name = 'CampaignBeneficiaryBankAccounts1803900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_beneficiary_bank_accounts" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "holder_type" varchar(12) NOT NULL,
        "party_id" uuid REFERENCES "campaign_parties"("global_id") ON DELETE SET NULL,
        "bank_name" varchar(200) NOT NULL,
        "account_no" varchar(40) NOT NULL,
        "account_name" varchar(200) NOT NULL,
        "valid_from" timestamptz NOT NULL DEFAULT now(),
        "valid_to" timestamptz,
        "close_reason" varchar(500),
        "verified_at" timestamptz,
        "verified_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "closed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        CONSTRAINT "UQ_campaign_beneficiary_bank_accounts_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_holder_type"
          CHECK ("holder_type" IN ('OWNER', 'BENEFICIARY')),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_party"
          CHECK ("holder_type" = 'BENEFICIARY' OR "party_id" IS NULL),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_account_no"
          CHECK ("account_no" ~ '^[0-9A-Za-z-]{4,40}$'),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_window"
          CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_close"
          CHECK (("valid_to" IS NULL) = ("close_reason" IS NULL)),
        CONSTRAINT "CHK_campaign_beneficiary_bank_accounts_verification"
          CHECK ("verified_by" IS NULL OR "verified_at" IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_beneficiary_bank_accounts_live"
        ON "campaign_beneficiary_bank_accounts" ("campaign_id") WHERE "valid_to" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_round_private_details"
        ADD COLUMN "beneficiary_bank_account_id" uuid
          REFERENCES "campaign_beneficiary_bank_accounts"("global_id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_round_private_details"
        DROP COLUMN "beneficiary_bank_account_id"
    `);
    await queryRunner.query(`DROP TABLE "campaign_beneficiary_bank_accounts"`);
  }
}
