import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 22/11/2026 đợt 4 — hệ số tăng điểm chiến dịch và bảng tin điểm.
 *
 * - `campaigns.point_bonus_percent` (hiệu lực, Admin chốt) và `requested_point_bonus_percent`
 *   (chủ dự án đề xuất), mỗi cột ∈ {0, 20, 50, 100}. `badge_name` thôi bắt buộc.
 * - `campaign_point_awards`: thêm mã `CHARITY_CAMPAIGN_BONUS`; award thưởng đi cặp đúng một award
 *   gốc qua `base_award_id` (UNIQUE) — gốc thì không có, thưởng thì bắt buộc có.
 * - `point_rules.CHARITY_CAMPAIGN_BONUS` chỉ để kiểm kê — dòng TRƠ (`points = 1` vì
 *   `CHK_point_rules_points` cấm 0, `is_enabled = false`): số thưởng tính theo hệ số của chiến
 *   dịch và ghi qua bút toán điều chỉnh, không đọc dòng này.
 * - `users.show_in_public_point_feed` (mặc định bật).
 * - Hai index sổ điểm cho bảng tin theo người và tra bút toán thưởng theo bút toán gốc.
 * - Ba khoá `point.feed_*`.
 */
export class CharityPointBonusAndFeed1804300000000 implements MigrationInterface {
  name = 'CharityPointBonusAndFeed1804300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ADD COLUMN "point_bonus_percent" smallint NOT NULL DEFAULT 0,
        ADD COLUMN "requested_point_bonus_percent" smallint NOT NULL DEFAULT 0,
        ADD CONSTRAINT "CHK_campaigns_point_bonus_percent"
          CHECK ("point_bonus_percent" IN (0, 20, 50, 100)),
        ADD CONSTRAINT "CHK_campaigns_requested_point_bonus_percent"
          CHECK ("requested_point_bonus_percent" IN (0, 20, 50, 100)),
        ALTER COLUMN "badge_name" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "campaign_point_awards"
        DROP CONSTRAINT "CHK_campaign_point_awards_rule",
        ADD CONSTRAINT "CHK_campaign_point_awards_rule" CHECK ("rule_code" IN
          ('CHARITY_ITEM_VALUE', 'CHARITY_POST_VIDEO', 'CHARITY_POST_IMAGE',
           'CHARITY_PARTICIPATION', 'CHARITY_CAMPAIGN_BONUS')),
        ADD COLUMN "base_award_id" uuid
          REFERENCES "campaign_point_awards"("global_id") ON DELETE CASCADE,
        ADD CONSTRAINT "UQ_campaign_point_awards_base" UNIQUE ("base_award_id"),
        ADD CONSTRAINT "CHK_campaign_point_awards_bonus_base"
          CHECK (("rule_code" = 'CHARITY_CAMPAIGN_BONUS') = ("base_award_id" IS NOT NULL))
    `);

    await queryRunner.query(
      `INSERT INTO point_rules (code, points, is_enabled, affects_lifetime, daily_cap, version)
       VALUES ('CHARITY_CAMPAIGN_BONUS', 1, false, true, NULL, 1)
       ON CONFLICT DO NOTHING`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "show_in_public_point_feed" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_point_ledger_user_id" ON "point_ledger" ("user_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_point_ledger_bonus_ref" ON "point_ledger" ("reference_id") WHERE "rule_code" = 'CHARITY_CAMPAIGN_BONUS'`,
    );

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        ('point.feed_min_delta', '10', 'INTEGER', 1, 'PUBLISHED',
         'Bảng tin điểm chung chỉ hiện bút toán (gốc + thưởng) từ mức này (CR 22/11/2026).'),
        ('point.feed_poll_seconds', '15', 'INTEGER', 1, 'PUBLISHED',
         'App hỏi lại bảng tin điểm sau bao nhiêu giây (CR 22/11/2026).'),
        ('point.feed_display_interval_ms', '2000', 'INTEGER', 1, 'PUBLISHED',
         'Mỗi dòng bảng tin điểm hiện cách nhau bao nhiêu mili giây (CR 22/11/2026).')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_configs"
       WHERE "config_key" IN ('point.feed_min_delta', 'point.feed_poll_seconds',
                              'point.feed_display_interval_ms')
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_point_ledger_bonus_ref"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_point_ledger_user_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "show_in_public_point_feed"`,
    );
    // Sổ điểm append-only: chỉ xoá rule khi chưa có bút toán nào dùng nó.
    await queryRunner.query(
      `DELETE FROM point_rules rule WHERE rule.code = 'CHARITY_CAMPAIGN_BONUS'
         AND NOT EXISTS (SELECT 1 FROM point_ledger entry WHERE entry.rule_code = rule.code)`,
    );
    await queryRunner.query(
      `DELETE FROM "campaign_point_awards" WHERE "rule_code" = 'CHARITY_CAMPAIGN_BONUS'`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_point_awards"
        DROP CONSTRAINT IF EXISTS "CHK_campaign_point_awards_bonus_base",
        DROP CONSTRAINT IF EXISTS "UQ_campaign_point_awards_base",
        DROP COLUMN IF EXISTS "base_award_id",
        DROP CONSTRAINT "CHK_campaign_point_awards_rule",
        ADD CONSTRAINT "CHK_campaign_point_awards_rule" CHECK ("rule_code" IN
          ('CHARITY_ITEM_VALUE', 'CHARITY_POST_VIDEO', 'CHARITY_POST_IMAGE',
           'CHARITY_PARTICIPATION'))
    `);
    await queryRunner.query(
      `UPDATE "campaigns" SET "badge_name" = 'Tấm lòng' WHERE "badge_name" IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaigns"
        ALTER COLUMN "badge_name" SET NOT NULL,
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_requested_point_bonus_percent",
        DROP CONSTRAINT IF EXISTS "CHK_campaigns_point_bonus_percent",
        DROP COLUMN IF EXISTS "requested_point_bonus_percent",
        DROP COLUMN IF EXISTS "point_bonus_percent"
    `);
  }
}
