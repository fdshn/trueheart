import { MigrationInterface, QueryRunner } from 'typeorm';

const PointRules: readonly [string, number, string][] = [
  [
    'CHARITY_ITEM_VALUE',
    1,
    'điểm cho mỗi 10.000đ giá trị vật phẩm ban tổ chức xác nhận',
  ],
  [
    'CHARITY_POST_VIDEO',
    2,
    'điểm cơ sở mỗi clip hợp lệ trong bài dự án (giữ chỗ)',
  ],
  [
    'CHARITY_POST_IMAGE',
    1,
    'điểm cơ sở mỗi ảnh hợp lệ trong bài dự án (giữ chỗ)',
  ],
  [
    'CHARITY_PARTICIPATION',
    100,
    'điểm tối đa khi tham gia, nhân mức hoàn thành / 100',
  ],
];

const CapKeys = [
  'CHARITY_ITEM_VALUE',
  'CHARITY_POST_VIDEO',
  'CHARITY_POST_IMAGE',
  'CHARITY_PARTICIPATION',
].flatMap((rule) =>
  ['daily', 'project', 'cycle'].map(
    (window) => `charity.points_cap.${rule.toLowerCase()}.${window}`,
  ),
);

const IntegerConfigs: readonly [string, number, string][] = [
  ...CapKeys.map((key): [string, number, string] => [
    key,
    0,
    'Trần điểm dự án từ thiện theo cửa sổ (0 = không trần). Chạm trần thì HOÃN, không bỏ.',
  ]),
  [
    'charity.post_points_participant_multiplier_percent',
    200,
    'Hệ số (%) điểm ảnh/clip của cộng tác viên sự kiện so với mức cơ sở.',
  ],
  [
    'charity.appeal_window_days',
    7,
    'Số ngày được khiếu nại kể từ lúc đánh giá/xác nhận giá trị.',
  ],
  [
    'charity.appeal_organizer_sla_days',
    3,
    'Hạn ban tổ chức xét khiếu nại tầng 1; quá hạn tự chuyển Admin.',
  ],
  [
    'charity.appeal_auto_close_days',
    3,
    'Người khiếu nại im lặng quá số ngày này sau quyết định tầng 1 thì đóng.',
  ],
];

/**
 * Dự án từ thiện 4 giai đoạn — đợt 4b (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.9, §3.16).
 *
 * ## Điểm theo giá trị, kèm trần (hoãn chứ không bỏ)
 *
 * `campaign_point_awards`: mỗi (rule, đối tượng) một dòng — lượt giao nhận, bài ảnh/clip, lượt
 * tham gia — với `target_points` (nên được bao nhiêu) và `applied_points` (đã ghi sổ). Chênh
 * dương ghi theo trần ngày / dự án / chu kỳ duy trì hạng (Admin cấu hình, 0 = không trần), phần
 * vướng trần nằm chờ — job `charity:points` ghi tiếp khi có chỗ. Chênh âm (chấm lại thấp hơn,
 * bài bị gỡ) ghi ngay một bút toán trừ — không sửa bút toán cũ.
 *
 * Bốn rule seed TẮT với mức của bảng Product (ảnh/clip là số giữ chỗ) — cùng lối
 * `CHARITY_CONTRIBUTION_COMPLETED`: chủ dự án bật khi chốt mức.
 *
 * ## Khiếu nại hai tầng
 *
 * `campaign_appeals` (một khiếu nại cho mỗi đối tượng — UNIQUE) + `campaign_appeal_events`
 * append-only. `campaign_delivery_items.confirmed_value` là giá trị ban tổ chức xác nhận —
 * đối tượng khiếu nại `ITEM_VALUE` và căn cứ điểm `CHARITY_ITEM_VALUE`.
 */
export class CharityProjectPoints1802800000000 implements MigrationInterface {
  name = 'CharityProjectPoints1802800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_delivery_items"
        ADD COLUMN "confirmed_value" bigint,
        ADD CONSTRAINT "CHK_campaign_delivery_items_confirmed_value" CHECK (
          "confirmed_value" IS NULL OR "confirmed_value" >= 0)
    `);
    // Tổng giá trị sau khiếu nại (§3.16) — có thì thay tổng các dòng làm căn cứ điểm.
    await queryRunner.query(`
      ALTER TABLE "campaign_deliveries"
        ADD COLUMN "confirmed_value_adjusted" bigint,
        ADD CONSTRAINT "CHK_campaign_deliveries_confirmed_value_adjusted" CHECK (
          "confirmed_value_adjusted" IS NULL OR "confirmed_value_adjusted" >= 0)
    `);

    for (const [code, points] of PointRules)
      await queryRunner.query(
        `INSERT INTO point_rules (code, points, is_enabled, affects_lifetime, daily_cap, version)
         VALUES ($1, $2, false, true, NULL, 1)
         ON CONFLICT DO NOTHING`,
        [code, points],
      );

    for (const [key, value, reason] of IntegerConfigs)
      await queryRunner.query(
        `INSERT INTO "system_configs"
           ("config_key", "value_json", "value_type", "version", "status", "change_reason")
         VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
         ON CONFLICT DO NOTHING`,
        [key, String(value), reason],
      );

    await queryRunner.query(`
      CREATE TABLE "campaign_point_awards" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "rule_code" varchar(30) NOT NULL,
        "reference_type" varchar(30) NOT NULL,
        "reference_id" varchar(80) NOT NULL,
        "target_points" integer NOT NULL,
        "applied_points" integer NOT NULL DEFAULT 0,
        "ledger_seq" integer NOT NULL DEFAULT 0,
        "reason" varchar(300) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_point_awards_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_point_awards_reference" UNIQUE (
          "rule_code", "reference_type", "reference_id", "user_id"),
        CONSTRAINT "CHK_campaign_point_awards_rule" CHECK ("rule_code" IN
          ('CHARITY_ITEM_VALUE', 'CHARITY_POST_VIDEO', 'CHARITY_POST_IMAGE',
           'CHARITY_PARTICIPATION')),
        CONSTRAINT "CHK_campaign_point_awards_points" CHECK (
          "target_points" >= 0 AND "applied_points" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_point_awards_pending" ON "campaign_point_awards" ("id") WHERE "applied_points" <> "target_points"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_point_awards_user_rule" ON "campaign_point_awards" ("user_id", "rule_code", "campaign_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "campaign_appeals" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "appellant_id" uuid NOT NULL REFERENCES "users"("global_id") ON DELETE CASCADE,
        "target_type" varchar(12) NOT NULL,
        "target_id" uuid NOT NULL,
        "original_value" bigint NOT NULL,
        "requested_value" bigint,
        "description" varchar(2000) NOT NULL,
        "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(20) NOT NULL DEFAULT 'ORGANIZER_REVIEW',
        "tier" smallint NOT NULL DEFAULT 1,
        "organizer_decision" varchar(8),
        "organizer_value" bigint,
        "organizer_reason" varchar(1000),
        "organizer_decided_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "organizer_decided_at" timestamptz,
        "admin_decision" varchar(8),
        "admin_value" bigint,
        "admin_reason" varchar(1000),
        "admin_decided_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "admin_decided_at" timestamptz,
        "outcome" varchar(20),
        "organizer_due_at" timestamptz NOT NULL,
        "appellant_due_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "closed_at" timestamptz,
        CONSTRAINT "UQ_campaign_appeals_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_appeals_target" UNIQUE ("target_type", "target_id"),
        CONSTRAINT "CHK_campaign_appeals_target_type" CHECK (
          "target_type" IN ('EVALUATION', 'ITEM_VALUE')),
        CONSTRAINT "CHK_campaign_appeals_status" CHECK ("status" IN
          ('ORGANIZER_REVIEW', 'AWAITING_APPELLANT', 'ADMIN_REVIEW', 'CLOSED')),
        CONSTRAINT "CHK_campaign_appeals_tier" CHECK ("tier" IN (1, 2)),
        CONSTRAINT "CHK_campaign_appeals_organizer_decision" CHECK (
          "organizer_decision" IS NULL OR "organizer_decision" IN ('ADJUST', 'KEEP')),
        CONSTRAINT "CHK_campaign_appeals_admin_decision" CHECK (
          "admin_decision" IS NULL OR "admin_decision" IN ('ADJUST', 'KEEP', 'REJECT')),
        CONSTRAINT "CHK_campaign_appeals_closed" CHECK (
          ("status" = 'CLOSED') = ("closed_at" IS NOT NULL AND "outcome" IS NOT NULL)),
        CONSTRAINT "CHK_campaign_appeals_evidence" CHECK (
          jsonb_typeof("evidence_urls") = 'array' AND jsonb_array_length("evidence_urls") <= 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_appeals_campaign" ON "campaign_appeals" ("campaign_id", "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_appeals_appellant" ON "campaign_appeals" ("appellant_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_appeals_open" ON "campaign_appeals" ("status", "id") WHERE "status" <> 'CLOSED'`,
    );

    await queryRunner.query(`
      CREATE TABLE "campaign_appeal_events" (
        "id" BIGSERIAL PRIMARY KEY,
        "appeal_id" uuid NOT NULL REFERENCES "campaign_appeals"("global_id") ON DELETE CASCADE,
        "actor_id" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "action" varchar(24) NOT NULL,
        "from_status" varchar(20),
        "to_status" varchar(20) NOT NULL,
        "value" bigint,
        "reason" varchar(1000),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_appeal_events_appeal" ON "campaign_appeal_events" ("appeal_id", "id")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION campaign_appeal_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'campaign_appeal_events is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER campaign_appeal_events_append_only
      BEFORE UPDATE OR DELETE ON "campaign_appeal_events"
      FOR EACH ROW EXECUTE FUNCTION campaign_appeal_events_append_only()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_appeal_events"`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS campaign_appeal_events_append_only()`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_appeals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_point_awards"`);
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = ANY($1::text[])`,
      [IntegerConfigs.map(([key]) => key)],
    );
    // Rule có thể đã phát sinh bút toán (sổ điểm append-only): chỉ xoá rule chưa từng dùng.
    await queryRunner.query(
      `DELETE FROM point_rules rule WHERE rule.code = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM point_ledger entry WHERE entry.rule_code = rule.code)`,
      [PointRules.map(([code]) => code)],
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_deliveries"
        DROP CONSTRAINT IF EXISTS "CHK_campaign_deliveries_confirmed_value_adjusted",
        DROP COLUMN IF EXISTS "confirmed_value_adjusted"
    `);
    await queryRunner.query(`
      ALTER TABLE "campaign_delivery_items"
        DROP CONSTRAINT IF EXISTS "CHK_campaign_delivery_items_confirmed_value",
        DROP COLUMN IF EXISTS "confirmed_value"
    `);
  }
}
