import { MigrationInterface, QueryRunner } from 'typeorm';

const MaxVideoKey = 'charity.post_max_video_seconds';

/**
 * Dự án từ thiện — đợt 5c (bổ sung): tranh chấp đóng góp và độ dài clip tối đa
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.5, §3.18, §7.3).
 *
 * ## Tranh chấp đóng góp
 *
 * `campaign_contribution_disputes`: người đóng góp hoặc ban tổ chức mở khi hai bên không thống
 * nhất về một đóng góp đã được chấp nhận (chưa giao, lệch số, sai chất lượng, sai giá trị).
 * Mỗi đóng góp tối đa MỘT tranh chấp đang mở (index duy nhất một phần). Bên kia hoặc Admin
 * giải quyết (bắt buộc kết luận), người mở được rút. Tranh chấp mở chặn hoàn tất dự án.
 *
 * ## Độ dài clip
 *
 * Mặc định 60 giây (Admin chỉnh 10–600): vừa trần 25 MB của storage ở 720p, tải được bằng
 * mạng yếu ở điểm trao. Client khai độ dài khi xin đường tải; lưu ở lượt ký và chép sang media
 * của bài.
 */
export class CharityDisputesAndClipLength1803100000000 implements MigrationInterface {
  name = 'CharityDisputesAndClipLength1803100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_contribution_disputes" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "contribution_id" uuid NOT NULL
          REFERENCES "campaign_contributions"("global_id") ON DELETE CASCADE,
        "opened_by" uuid NOT NULL REFERENCES "users"("global_id"),
        "opened_by_party" varchar(12) NOT NULL,
        "reason" varchar(20) NOT NULL,
        "description" varchar(2000) NOT NULL,
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(10) NOT NULL DEFAULT 'OPEN',
        "resolution" varchar(2000),
        "closed_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "closed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_contribution_disputes_global_id" UNIQUE ("global_id"),
        CONSTRAINT "CHK_campaign_contribution_disputes_party" CHECK ("opened_by_party" IN
          ('CONTRIBUTOR', 'ORGANIZER')),
        CONSTRAINT "CHK_campaign_contribution_disputes_reason" CHECK ("reason" IN
          ('NOT_DELIVERED', 'QUANTITY_MISMATCH', 'QUALITY_ISSUE', 'VALUE_MISMATCH', 'OTHER')),
        CONSTRAINT "CHK_campaign_contribution_disputes_description" CHECK (
          length(btrim("description")) >= 10),
        CONSTRAINT "CHK_campaign_contribution_disputes_status" CHECK ("status" IN
          ('OPEN', 'RESOLVED', 'WITHDRAWN')),
        -- Đóng là có mốc; giải quyết là có kết luận.
        CONSTRAINT "CHK_campaign_contribution_disputes_closed" CHECK (
          ("status" = 'OPEN') = ("closed_at" IS NULL)
          AND ("status" <> 'RESOLVED' OR length(btrim(coalesce("resolution", ''))) > 0))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_campaign_contribution_disputes_open"
        ON "campaign_contribution_disputes" ("contribution_id") WHERE "status" = 'OPEN'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_contribution_disputes_campaign"
        ON "campaign_contribution_disputes" ("campaign_id", "status", "created_at" DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_post_uploads"
        ADD COLUMN "duration_seconds" integer,
        ADD CONSTRAINT "CHK_campaign_post_uploads_duration" CHECK (
          "duration_seconds" IS NULL OR "duration_seconds" BETWEEN 1 AND 3600)
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_post_media"
        ADD COLUMN "duration_seconds" integer,
        ADD CONSTRAINT "CHK_campaign_post_media_duration" CHECK (
          "duration_seconds" IS NULL OR "duration_seconds" BETWEEN 1 AND 3600)
    `);
    await queryRunner.query(
      `INSERT INTO "system_configs"
         ("config_key", "value_json", "value_type", "version", "status", "change_reason")
       VALUES ($1, '60'::jsonb, 'INTEGER', 1, 'PUBLISHED',
               'Độ dài clip tối đa (giây) trong bài dự án từ thiện — vừa trần 25 MB ở 720p.')
       ON CONFLICT DO NOTHING`,
      [MaxVideoKey],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = $1`,
      [MaxVideoKey],
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_post_media"
        DROP CONSTRAINT "CHK_campaign_post_media_duration",
        DROP COLUMN "duration_seconds"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_post_uploads"
        DROP CONSTRAINT "CHK_campaign_post_uploads_duration",
        DROP COLUMN "duration_seconds"
    `);
    await queryRunner.query(`DROP TABLE "campaign_contribution_disputes"`);
  }
}
