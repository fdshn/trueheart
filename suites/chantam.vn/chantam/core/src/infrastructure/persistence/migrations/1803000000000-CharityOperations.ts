import { MigrationInterface, QueryRunner } from 'typeorm';

const NoRound = `'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * Dự án từ thiện — đợt 5b/5c, quyết định Product 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md
 * §3.2, §3.4, §3.11, §3.18).
 *
 * ## Hỗ trợ mở
 *
 * `campaign_other_support_needs` (chuyến xe, công sức, kỹ năng/dịch vụ, địa điểm, thiết bị, suất
 * ăn…) bổ sung, không thay ba nhóm tiền/hiện vật/nhân lực. Người dùng nhận hỗ trợ một phần, nhiều
 * lần qua `campaign_other_support_offers`; ban tổ chức nhận / từ chối / ghi hoàn thành. Nguồn
 * ngoài app (`external_quantity`) bắt buộc có bằng chứng — tính tiến độ, không sinh điểm.
 *
 * ## Nhiều đợt trao
 *
 * `campaign_distribution_rounds`: mỗi đợt có giờ, địa điểm, checklist trước 48 giờ, xác nhận sẵn
 * sàng (thiếu thì CẢNH BÁO, không chặn), nhắc 48 giờ riêng. Participant, lượt giao nhận và
 * timeline gắn được vào một đợt (`round_id`, NULL = chưa phân đợt / dự án một đợt). Timeline
 * duy nhất theo (dự án, đợt, bước).
 *
 * ## Nguồn ngoài app chống đếm trùng
 *
 * `campaign_external_contributions.source_reference` (số biên nhận, mã chứng từ…) duy nhất
 * trong dự án giữa các dòng còn hiệu lực.
 */
export class CharityOperations1803000000000 implements MigrationInterface {
  name = 'CharityOperations1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_other_support_needs" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "support_type" varchar(24) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" varchar(2000),
        "unit" varchar(50) NOT NULL,
        "target_quantity" integer NOT NULL,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "location_label" varchar(500),
        "requirements" varchar(2000),
        "handover_method" varchar(500),
        "pic_name" varchar(120),
        "pic_phone" varchar(30),
        "external_quantity" integer NOT NULL DEFAULT 0,
        "external_evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "external_note" varchar(1000),
        "status" varchar(10) NOT NULL DEFAULT 'OPEN',
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_other_support_needs_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_other_support_needs_type" CHECK ("support_type" IN
          ('TRANSPORT', 'LABOR', 'SKILL_SERVICE', 'VENUE', 'EQUIPMENT', 'MEAL_ACCOMMODATION',
           'COMMUNICATION', 'OTHER')),
        CONSTRAINT "CHK_campaign_other_support_needs_title" CHECK (length(btrim("title")) > 0),
        CONSTRAINT "CHK_campaign_other_support_needs_unit" CHECK (length(btrim("unit")) > 0),
        CONSTRAINT "CHK_campaign_other_support_needs_target" CHECK ("target_quantity" >= 1),
        CONSTRAINT "CHK_campaign_other_support_needs_time" CHECK (
          "starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"),
        CONSTRAINT "CHK_campaign_other_support_needs_status" CHECK ("status" IN ('OPEN', 'CLOSED')),
        -- Nguồn ngoài app tính vào tiến độ thì phải có bằng chứng (§3.18).
        CONSTRAINT "CHK_campaign_other_support_needs_external" CHECK (
          "external_quantity" >= 0 AND (
            "external_quantity" = 0 OR jsonb_array_length("external_evidence_urls") > 0))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_other_support_needs_campaign"
        ON "campaign_other_support_needs" ("campaign_id", "sort_order", "id")
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_other_support_offers" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "need_id" uuid NOT NULL
          REFERENCES "campaign_other_support_needs"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "quantity" integer NOT NULL,
        "completed_quantity" integer,
        "note" varchar(1000),
        "status" varchar(10) NOT NULL DEFAULT 'PENDING',
        "decided_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "decided_at" timestamptz,
        "decision_reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_other_support_offers_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_other_support_offers_quantity" CHECK ("quantity" >= 1),
        CONSTRAINT "CHK_campaign_other_support_offers_status" CHECK ("status" IN
          ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'WITHDRAWN')),
        -- Hoàn thành thì ghi số thực làm (một phần được), không quá số đã nhận.
        CONSTRAINT "CHK_campaign_other_support_offers_completed" CHECK (
          ("status" = 'COMPLETED') = ("completed_quantity" IS NOT NULL)
          AND ("completed_quantity" IS NULL
               OR "completed_quantity" BETWEEN 0 AND "quantity"))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_other_support_offers_need"
        ON "campaign_other_support_offers" ("need_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_other_support_offers_user"
        ON "campaign_other_support_offers" ("user_id", "created_at" DESC)
    `);

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
        CONSTRAINT "UQ_campaign_distribution_rounds_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_distribution_rounds_title" CHECK (length(btrim("title")) > 0),
        CONSTRAINT "CHK_campaign_distribution_rounds_time" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_campaign_distribution_rounds_status" CHECK ("status" IN
          ('PLANNED', 'DONE', 'CANCELLED')),
        -- Huỷ đợt phải có lý do (§3.18).
        CONSTRAINT "CHK_campaign_distribution_rounds_cancel_reason" CHECK (
          "status" <> 'CANCELLED' OR length(btrim(coalesce("status_reason", ''))) > 0),
        CONSTRAINT "CHK_campaign_distribution_rounds_readiness" CHECK ("readiness" IN
          ('PENDING', 'READY', 'NOT_READY')),
        -- Báo CHƯA sẵn sàng thì phải ghi lý do (§3.4).
        CONSTRAINT "CHK_campaign_distribution_rounds_not_ready_note" CHECK (
          "readiness" <> 'NOT_READY' OR length(btrim(coalesce("readiness_note", ''))) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_distribution_rounds_campaign"
        ON "campaign_distribution_rounds" ("campaign_id", "starts_at")
    `);
    // Nhắc 48 giờ theo đợt: job quét đợt sắp tới.
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_distribution_rounds_upcoming"
        ON "campaign_distribution_rounds" ("starts_at") WHERE "status" = 'PLANNED'
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

    // Timeline theo đợt: thay UNIQUE (dự án, bước) bằng (dự án, đợt, bước).
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

    await queryRunner.query(`
      ALTER TABLE "campaign_announcements"
        DROP CONSTRAINT "CHK_campaign_announcements_kind",
        ADD CONSTRAINT "CHK_campaign_announcements_kind" CHECK ("kind" IN
          ('STAGE_CHANGED', 'PLAN_CHANGED', 'PRE_EVENT', 'SUMMARY_PUBLISHED', 'ROUND_CHANGED'))
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_external_contributions"
        ADD COLUMN "source_reference" varchar(120)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_campaign_external_contributions_reference"
        ON "campaign_external_contributions" ("campaign_id", lower(btrim("source_reference")))
        WHERE "source_reference" IS NOT NULL AND "status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_campaign_external_contributions_reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign_external_contributions" DROP COLUMN "source_reference"`,
    );
    await queryRunner.query(
      `DELETE FROM campaign_announcements WHERE kind = 'ROUND_CHANGED'`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_announcements"
        DROP CONSTRAINT "CHK_campaign_announcements_kind",
        ADD CONSTRAINT "CHK_campaign_announcements_kind" CHECK ("kind" IN
          ('STAGE_CHANGED', 'PLAN_CHANGED', 'PRE_EVENT', 'SUMMARY_PUBLISHED'))
    `);
    // Bước của các đợt mất theo (CASCADE khi gỡ bảng đợt); còn lại timeline của dự án.
    await queryRunner.query(
      `DELETE FROM campaign_event_steps WHERE round_id IS NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "UQ_campaign_event_steps_round_key"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_event_steps"
        DROP COLUMN "round_id",
        ADD CONSTRAINT "UQ_campaign_event_steps_key" UNIQUE ("campaign_id", "step_key")
    `);
    for (const table of ['campaign_deliveries', 'campaign_participations'])
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "round_id"`);
    await queryRunner.query(`DROP TABLE "campaign_distribution_rounds"`);
    await queryRunner.query(`DROP TABLE "campaign_other_support_offers"`);
    await queryRunner.query(`DROP TABLE "campaign_other_support_needs"`);
  }
}
