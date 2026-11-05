import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dự án từ thiện 4 giai đoạn — đợt 4a (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.6, §3.14, §3.17).
 *
 * ## Tổng kết tab D
 *
 * `campaign_summaries` 1-1: công khai khi `published_at` có giá trị; sửa sau khi công khai ghi
 * revision `SUMMARY`. `campaign_financial_reports`: dự án có nhận tiền thì phải có ít nhất một
 * báo cáo đủ kỳ, tổng thu/chi, diễn giải và sao kê mới công khai được tổng kết — database giữ
 * "đủ" (sao kê không rỗng, kỳ hợp lệ), use case giữ "có".
 *
 * ## Chấm mức hoàn thành
 *
 * `campaign_participant_evaluations` append-only: chấm lại = dòng mới; dòng mới nhất là điểm
 * hiện hành. Nội bộ — chỉ ban tổ chức được cấp quyền và Admin xem; người được chấm chỉ thấy
 * điểm của mình (không thấy ghi chú).
 *
 * ## Nickname công khai (phương án C)
 *
 * `users.show_in_public_supporter_lists` là mặc định; `show_name_publicly` trên từng đóng góp /
 * đăng ký tham gia là lựa chọn tại lần đó. Dữ liệu cũ `false` — không ai bị lộ tên vì một tính
 * năng ra đời sau lúc họ góp.
 *
 * ## Card Home
 *
 * Cột `featured_*` trên `campaigns`: ban tổ chức đề xuất (`promotion_requested_at`), Admin bật.
 */
export class CharityProjectSummary1802700000000 implements MigrationInterface {
  name = 'CharityProjectSummary1802700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_summaries" (
        "campaign_id" uuid PRIMARY KEY REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "summary" varchar(5000),
        "usage_report" varchar(5000),
        "thanks_message" varchar(2000),
        "lessons_learned" varchar(5000),
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "published_at" timestamptz,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_campaign_summaries_evidence" CHECK (
          jsonb_typeof("evidence_urls") = 'array' AND jsonb_array_length("evidence_urls") <= 20)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_financial_reports" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "period_from" date NOT NULL,
        "period_to" date NOT NULL,
        "total_income" bigint NOT NULL,
        "total_expense" bigint NOT NULL,
        "balance" bigint GENERATED ALWAYS AS ("total_income" - "total_expense") STORED,
        "explanation" varchar(5000) NOT NULL,
        "statement_urls" jsonb NOT NULL,
        "updated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_financial_reports_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_financial_reports_period" CHECK ("period_from" <= "period_to"),
        CONSTRAINT "CHK_campaign_financial_reports_amounts" CHECK (
          "total_income" >= 0 AND "total_expense" >= 0),
        CONSTRAINT "CHK_campaign_financial_reports_explanation" CHECK (
          length(trim("explanation")) > 0),
        CONSTRAINT "CHK_campaign_financial_reports_statements" CHECK (
          jsonb_typeof("statement_urls") = 'array'
          AND jsonb_array_length("statement_urls") BETWEEN 1 AND 20)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_financial_reports_campaign" ON "campaign_financial_reports" ("campaign_id", "period_from")`,
    );

    await queryRunner.query(`
      CREATE TABLE "campaign_participant_evaluations" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "participant_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "completion_score" smallint NOT NULL,
        "note" varchar(1000),
        "evaluated_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "source" varchar(12) NOT NULL DEFAULT 'ORGANIZER',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_participant_evaluations_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_participant_evaluations_score" CHECK (
          "completion_score" BETWEEN 0 AND 100),
        CONSTRAINT "CHK_campaign_participant_evaluations_source" CHECK (
          "source" IN ('ORGANIZER', 'APPEAL', 'ADMIN'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_participant_evaluations_latest" ON "campaign_participant_evaluations" ("campaign_id", "participant_id", "id" DESC)`,
    );
    await queryRunner.query(`
      CREATE FUNCTION campaign_participant_evaluations_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'campaign_participant_evaluations is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER campaign_participant_evaluations_append_only
      BEFORE UPDATE OR DELETE ON "campaign_participant_evaluations"
      FOR EACH ROW EXECUTE FUNCTION campaign_participant_evaluations_append_only()
    `);

    // Revision cho tổng kết và báo cáo tài chính sửa sau khi công khai.
    await queryRunner.query(
      `ALTER TABLE "campaign_revisions" DROP CONSTRAINT "CHK_campaign_revisions_entity"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_revisions" ADD CONSTRAINT "CHK_campaign_revisions_entity" CHECK ("entity" IN
        ('CAMPAIGN', 'PARTY', 'TEAM', 'PHASE', 'NEED_ITEM', 'BANK_ACCOUNT', 'FUNDING_NEED',
         'VOLUNTEER_NEED', 'TASK', 'SUMMARY', 'FINANCIAL_REPORT'))
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "show_in_public_supporter_lists" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_contributions"
        ADD COLUMN "show_name_publicly" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_participations"
        ADD COLUMN "show_name_publicly" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "featured_on_home" boolean NOT NULL DEFAULT false,
        ADD COLUMN "featured_title" varchar(120),
        ADD COLUMN "featured_message" varchar(300),
        ADD COLUMN "featured_media_url" varchar(1000),
        ADD COLUMN "featured_cta" varchar(10),
        ADD COLUMN "featured_from" timestamptz,
        ADD COLUMN "featured_until" timestamptz,
        ADD COLUMN "featured_priority" smallint NOT NULL DEFAULT 0,
        ADD COLUMN "promotion_requested_at" timestamptz,
        ADD COLUMN "promotion_request_note" varchar(500),
        ADD CONSTRAINT "CHK_campaigns_featured_cta" CHECK (
          "featured_cta" IS NULL OR "featured_cta" IN ('VIEW', 'SUPPORT', 'JOIN')),
        ADD CONSTRAINT "CHK_campaigns_featured_window" CHECK (
          "featured_from" IS NULL OR "featured_until" IS NULL OR "featured_from" < "featured_until"),
        ADD CONSTRAINT "CHK_campaigns_featured_complete" CHECK (
          NOT "featured_on_home" OR ("featured_title" IS NOT NULL AND "featured_cta" IS NOT NULL))
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaigns_featured" ON "campaigns" ("featured_priority" DESC, "id" DESC) WHERE "featured_on_home"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_featured"`);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_featured_complete",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_featured_window",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_featured_cta",
        DROP COLUMN IF EXISTS "promotion_request_note",
        DROP COLUMN IF EXISTS "promotion_requested_at",
        DROP COLUMN IF EXISTS "featured_priority",
        DROP COLUMN IF EXISTS "featured_until",
        DROP COLUMN IF EXISTS "featured_from",
        DROP COLUMN IF EXISTS "featured_cta",
        DROP COLUMN IF EXISTS "featured_media_url",
        DROP COLUMN IF EXISTS "featured_message",
        DROP COLUMN IF EXISTS "featured_title",
        DROP COLUMN IF EXISTS "featured_on_home"
    `);
    await queryRunner.query(
      `ALTER TABLE "campaign_participations" DROP COLUMN IF EXISTS "show_name_publicly"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign_contributions" DROP COLUMN IF EXISTS "show_name_publicly"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "show_in_public_supporter_lists"`,
    );
    // Revision của hai entity mới đi theo bảng của chúng; trigger append-only chặn DELETE.
    await queryRunner.query(
      `ALTER TABLE "campaign_revisions" DISABLE TRIGGER campaign_revisions_append_only`,
    );
    await queryRunner.query(
      `DELETE FROM "campaign_revisions" WHERE "entity" IN ('SUMMARY', 'FINANCIAL_REPORT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign_revisions" ENABLE TRIGGER campaign_revisions_append_only`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign_revisions" DROP CONSTRAINT "CHK_campaign_revisions_entity"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_revisions" ADD CONSTRAINT "CHK_campaign_revisions_entity" CHECK ("entity" IN
        ('CAMPAIGN', 'PARTY', 'TEAM', 'PHASE', 'NEED_ITEM', 'BANK_ACCOUNT', 'FUNDING_NEED',
         'VOLUNTEER_NEED', 'TASK'))
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "campaign_participant_evaluations"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaign_participant_evaluations_append_only()`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "campaign_financial_reports"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_summaries"`);
  }
}
