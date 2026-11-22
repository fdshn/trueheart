import { MigrationInterface, QueryRunner } from 'typeorm';

const NoRound = `'00000000-0000-0000-0000-000000000000'::uuid`;

const PrivateColumns = [
  'recipient_name',
  'recipient_phone',
  'recipient_address',
  'coordinator_name',
  'coordinator_phone',
  'carrier',
  'shipping_fee_payer',
  'estimated_shipping_fee',
  'tracking_code',
  'transfer_content',
  'beneficiary_bank_account_id',
];

/**
 * Bỏ cơ chế đợt trao (CR 22/11/2026 §9): hình thức trao, bằng chứng và chi tiết riêng tư lên
 * cấp chiến dịch; một timeline duy nhất mỗi chiến dịch; thêm bước tổng duyệt (§8).
 *
 * Chỉ có data test. Mỗi chiến dịch giữ đợt mới nhất chưa huỷ (chép lên chiến dịch), bỏ các đợt
 * còn lại. Chiến dịch đã có timeline riêng (round_id NULL) giữ timeline đó; chưa có thì nhận
 * timeline của đợt được chọn.
 */
export class CharityCampaignLevelDistribution1804000000000 implements MigrationInterface {
  name = 'CharityCampaignLevelDistribution1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "distribution_method" varchar(20),
        ADD COLUMN "distribution_contribution_types" text[] NOT NULL DEFAULT '{}'::text[],
        ADD COLUMN "distribution_evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "distribution_service_type" varchar(30),
        ADD COLUMN "distribution_service_channel" varchar(15),
        ADD CONSTRAINT "CHK_campaigns_distribution_method"
          CHECK ("distribution_method" IS NULL OR "distribution_method" IN
            ('DIRECT_RECIPIENT', 'SHIPPING', 'OTHER_LOCATION', 'BANK_TRANSFER', 'SERVICE')),
        ADD CONSTRAINT "CHK_campaigns_distribution_contribution_types"
          CHECK ("distribution_contribution_types" <@ ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[]),
        ADD CONSTRAINT "CHK_campaigns_distribution_evidence_urls"
          CHECK (jsonb_typeof("distribution_evidence_urls") = 'array'
            AND jsonb_array_length("distribution_evidence_urls") <= 20),
        ADD CONSTRAINT "CHK_campaigns_distribution_service_channel"
          CHECK ("distribution_service_channel" IS NULL OR "distribution_service_channel" IN
            ('IN_PERSON', 'ONLINE', 'HOTLINE', 'APPOINTMENT'))
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_distribution_private_details" (
        "campaign_id" uuid PRIMARY KEY REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "beneficiary_bank_account_id" uuid
          REFERENCES "campaign_beneficiary_bank_accounts"("global_id") ON DELETE SET NULL,
        "recipient_name" varchar(200),
        "recipient_phone" varchar(30),
        "recipient_address" varchar(500),
        "coordinator_name" varchar(200),
        "coordinator_phone" varchar(30),
        "carrier" varchar(200),
        "shipping_fee_payer" varchar(12) CHECK ("shipping_fee_payer" IN ('ORGANIZER', 'RECIPIENT')),
        "estimated_shipping_fee" integer
          CHECK ("estimated_shipping_fee" >= 0 AND "estimated_shipping_fee" <= 10000000),
        "tracking_code" varchar(100),
        "transfer_content" varchar(200),
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_rehearsals" (
        "campaign_id" uuid PRIMARY KEY REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "outcome" varchar(10),
        "reason" varchar(1000),
        "note" varchar(2000),
        "decided_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "decided_at" timestamptz,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_campaign_rehearsals_outcome"
          CHECK ("outcome" IS NULL OR "outcome" IN ('READY', 'NOT_READY')),
        CONSTRAINT "CHK_campaign_rehearsals_decided"
          CHECK ("outcome" IS NULL OR "decided_at" IS NOT NULL),
        CONSTRAINT "CHK_campaign_rehearsals_not_ready_reason"
          CHECK ("outcome" IS DISTINCT FROM 'NOT_READY'
            OR length(btrim(coalesce("reason", ''))) > 0),
        CONSTRAINT "CHK_campaign_rehearsals_checklist"
          CHECK (jsonb_typeof("checklist") = 'array')
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_phases"
        DROP CONSTRAINT "CHK_campaign_phases_phase",
        ADD CONSTRAINT "CHK_campaign_phases_phase"
          CHECK ("phase" IN ('PLANNING', 'PREPARATION', 'REHEARSAL', 'DISTRIBUTION', 'REPORTING'))
    `);

    // 1. Đợt được giữ: mới nhất chưa huỷ.
    await queryRunner.query(`
      CREATE TEMP TABLE "chosen_round" AS
        SELECT DISTINCT ON (round."campaign_id")
               round."campaign_id", round."global_id" AS "round_id"
          FROM "campaign_distribution_rounds" round
         WHERE round."status" <> 'CANCELLED'
         ORDER BY round."campaign_id", round."starts_at" DESC, round."id" DESC
    `);

    // 2. Hình thức, loại, bằng chứng, dịch vụ lên chiến dịch.
    await queryRunner.query(`
      UPDATE "campaigns" campaign
         SET "distribution_method" = round."distribution_method",
             "distribution_contribution_types" = round."contribution_types",
             "distribution_evidence_urls" = round."evidence_urls",
             "distribution_service_type" = round."service_type",
             "distribution_service_channel" = round."service_channel"
        FROM "chosen_round" chosen
        JOIN "campaign_distribution_rounds" round ON round."global_id" = chosen."round_id"
       WHERE campaign."global_id" = chosen."campaign_id"
    `);

    // 3. Chi tiết riêng tư (kể cả tài khoản thụ hưởng).
    await queryRunner.query(`
      INSERT INTO "campaign_distribution_private_details"
        ("campaign_id", ${PrivateColumns.map((c) => `"${c}"`).join(', ')}, "updated_by", "updated_at")
      SELECT chosen."campaign_id", ${PrivateColumns.map((c) => `detail."${c}"`).join(', ')},
             detail."updated_by", detail."updated_at"
        FROM "chosen_round" chosen
        JOIN "campaign_round_private_details" detail ON detail."round_id" = chosen."round_id"
    `);

    // 4. Timeline: chiến dịch chưa có timeline riêng thì nhận timeline của đợt được chọn.
    await queryRunner.query(`
      UPDATE "campaign_event_steps" step
         SET "round_id" = NULL
        FROM "chosen_round" chosen
       WHERE step."round_id" = chosen."round_id"
         AND NOT EXISTS (
           SELECT 1 FROM "campaign_event_steps" own
            WHERE own."campaign_id" = step."campaign_id" AND own."round_id" IS NULL)
    `);
    await queryRunner.query(
      `DELETE FROM "campaign_event_steps" WHERE "round_id" IS NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE "chosen_round"`);

    // 5. Gỡ round_id, timeline quay về UNIQUE (chiến dịch, bước).
    await queryRunner.query(`DROP INDEX "UQ_campaign_event_steps_round_key"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_event_steps"
        DROP COLUMN "round_id",
        ADD CONSTRAINT "UQ_campaign_event_steps_key" UNIQUE ("campaign_id", "step_key")
    `);
    for (const table of ['campaign_participations', 'campaign_deliveries'])
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "round_id"`);

    // 6. Thông báo theo đợt.
    await queryRunner.query(
      `DELETE FROM "campaign_announcements" WHERE "kind" = 'ROUND_CHANGED'`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_announcements"
        DROP CONSTRAINT "CHK_campaign_announcements_kind",
        ADD CONSTRAINT "CHK_campaign_announcements_kind" CHECK ("kind" IN
          ('STAGE_CHANGED', 'PLAN_CHANGED', 'PRE_EVENT', 'SUMMARY_PUBLISHED'))
    `);

    // 7. Gỡ bảng đợt trao.
    await queryRunner.query(`DROP TABLE "campaign_round_private_details"`);
    await queryRunner.query(`DROP TABLE "campaign_distribution_rounds"`);
    // 8. Không tạo tổng duyệt cho chiến dịch cũ: chiến dịch đã qua EXECUTION không bị chặn.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dựng lại bảng/cột đợt trao RỖNG đúng tên như 1803000000000/1803800000000/1803900000000
    // để down của các migration đó chạy được. Không khôi phục dữ liệu.
    await queryRunner.query(`
      CREATE TABLE "campaign_distribution_rounds" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "location_label" varchar(500),
        "address" varchar(500),
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "status" varchar(10) NOT NULL DEFAULT 'PLANNED',
        "status_reason" varchar(500),
        "readiness" varchar(10) NOT NULL DEFAULT 'PENDING',
        "readiness_note" varchar(1000),
        "readiness_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "readiness_at" timestamptz,
        "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "distribution_method" varchar(20),
        "contribution_types" text[] NOT NULL DEFAULT '{}'::text[],
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "needs_review" boolean NOT NULL DEFAULT false,
        "service_type" varchar(30),
        "service_channel" varchar(15),
        "location" geography(Point, 4326),
        CONSTRAINT "UQ_campaign_distribution_rounds_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_distribution_rounds_title" CHECK (length(btrim("title")) > 0),
        CONSTRAINT "CHK_campaign_distribution_rounds_time" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_campaign_distribution_rounds_status" CHECK ("status" IN
          ('PLANNED', 'DONE', 'CANCELLED')),
        CONSTRAINT "CHK_campaign_distribution_rounds_cancel_reason" CHECK (
          "status" <> 'CANCELLED' OR length(btrim(coalesce("status_reason", ''))) > 0),
        CONSTRAINT "CHK_campaign_distribution_rounds_readiness" CHECK ("readiness" IN
          ('PENDING', 'READY', 'NOT_READY')),
        CONSTRAINT "CHK_campaign_distribution_rounds_not_ready_note" CHECK (
          "readiness" <> 'NOT_READY' OR length(btrim(coalesce("readiness_note", ''))) > 0),
        CONSTRAINT "CHK_campaign_distribution_rounds_distribution_method"
          CHECK ("distribution_method" IS NULL OR "distribution_method" IN
            ('DIRECT_RECIPIENT', 'SHIPPING', 'OTHER_LOCATION', 'BANK_TRANSFER', 'SERVICE')),
        CONSTRAINT "CHK_campaign_distribution_rounds_contribution_types"
          CHECK ("contribution_types" <@ ARRAY['MATERIAL', 'MONEY', 'SERVICE']::text[]),
        CONSTRAINT "CHK_campaign_distribution_rounds_evidence_urls"
          CHECK (jsonb_typeof("evidence_urls") = 'array' AND jsonb_array_length("evidence_urls") <= 20),
        CONSTRAINT "CHK_campaign_distribution_rounds_service_channel"
          CHECK ("service_channel" IS NULL OR "service_channel" IN
            ('IN_PERSON', 'ONLINE', 'HOTLINE', 'APPOINTMENT'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_distribution_rounds_campaign"
        ON "campaign_distribution_rounds" ("campaign_id", "starts_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_distribution_rounds_upcoming"
        ON "campaign_distribution_rounds" ("starts_at") WHERE "status" = 'PLANNED'
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
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "beneficiary_bank_account_id" uuid
          REFERENCES "campaign_beneficiary_bank_accounts"("global_id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_announcements"
        DROP CONSTRAINT "CHK_campaign_announcements_kind",
        ADD CONSTRAINT "CHK_campaign_announcements_kind" CHECK ("kind" IN
          ('STAGE_CHANGED', 'PLAN_CHANGED', 'PRE_EVENT', 'SUMMARY_PUBLISHED', 'ROUND_CHANGED'))
    `);

    for (const table of ['campaign_participations', 'campaign_deliveries'])
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN "round_id" uuid
            REFERENCES "campaign_distribution_rounds"("global_id") ON DELETE SET NULL
      `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_participations_round" ON "campaign_participations" ("round_id") WHERE "round_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_deliveries_round" ON "campaign_deliveries" ("round_id") WHERE "round_id" IS NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_event_steps"
        ADD COLUMN "round_id" uuid
          REFERENCES "campaign_distribution_rounds"("global_id") ON DELETE CASCADE,
        DROP CONSTRAINT "UQ_campaign_event_steps_key"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_campaign_event_steps_round_key"
        ON "campaign_event_steps" ("campaign_id", COALESCE("round_id", ${NoRound}), "step_key")
    `);

    await queryRunner.query(
      `DELETE FROM "campaign_phases" WHERE "phase" = 'REHEARSAL'`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_phases"
        DROP CONSTRAINT "CHK_campaign_phases_phase",
        ADD CONSTRAINT "CHK_campaign_phases_phase"
          CHECK ("phase" IN ('PLANNING', 'PREPARATION', 'DISTRIBUTION', 'REPORTING'))
    `);
    await queryRunner.query(`DROP TABLE "campaign_rehearsals"`);
    await queryRunner.query(
      `DROP TABLE "campaign_distribution_private_details"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT "CHK_campaigns_distribution_service_channel",
        DROP CONSTRAINT "CHK_campaigns_distribution_evidence_urls",
        DROP CONSTRAINT "CHK_campaigns_distribution_contribution_types",
        DROP CONSTRAINT "CHK_campaigns_distribution_method",
        DROP COLUMN "distribution_service_channel",
        DROP COLUMN "distribution_service_type",
        DROP COLUMN "distribution_evidence_urls",
        DROP COLUMN "distribution_contribution_types",
        DROP COLUMN "distribution_method"
    `);
  }
}
