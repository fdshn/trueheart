import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 25/11/2026 — đăng ký ủng hộ tiền cho chiến dịch từ thiện
 * (docs/plans/2026-11-25-charity-money-pledges.md).
 *
 * - `campaign_money_pledges`: lời khai `INTENDED → COMPLETED` giống `merit_declarations`, kèm tài
 *   khoản nhận lúc khai, nội dung chuyển khoản do backend sinh (duy nhất) và ba cột ẩn của chủ dự án.
 * - `campaign_bank_accounts.bank_bin` (tuỳ chọn): có BIN thì dựng được VietQR. Tài khoản cũ không
 *   có — không suy từ tên ngân hàng vì tên gõ tay không đáng tin.
 * - Rule `CHARITY_MONEY_PLEDGE`: TẮT như mọi rule dự án lúc ship, Admin bật. `points = 1` chỉ để qua
 *   `CHK_point_rules_points`; mức điểm lấy theo rule `CHARITY_ITEM_VALUE` × `points_percent`.
 * - Ba khoá trần (0 = không trần) + `charity.money_pledge.points_percent` = 50.
 */
const IntegerConfigs: ReadonlyArray<[string, number, string]> = [
  [
    'charity.money_pledge.points_percent',
    50,
    'Điểm ủng hộ tiền bằng bao nhiêu % điểm vật phẩm cùng giá trị (CR 25/11/2026).',
  ],
  [
    'charity.points_cap.charity_money_pledge.daily',
    0,
    'Trần điểm ủng hộ tiền mỗi ngày, 0 = không trần (CR 25/11/2026).',
  ],
  [
    'charity.points_cap.charity_money_pledge.project',
    0,
    'Trần điểm ủng hộ tiền mỗi dự án, 0 = không trần (CR 25/11/2026).',
  ],
  [
    'charity.points_cap.charity_money_pledge.cycle',
    0,
    'Trần điểm ủng hộ tiền mỗi chu kỳ hạng, 0 = không trần (CR 25/11/2026).',
  ],
];

export class CharityMoneyPledges1804600000000 implements MigrationInterface {
  name = 'CharityMoneyPledges1804600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_bank_accounts"
        ADD COLUMN "bank_bin" varchar(6),
        ADD CONSTRAINT "CHK_campaign_bank_accounts_bank_bin"
          CHECK ("bank_bin" IS NULL OR "bank_bin" ~ '^[0-9]{6}$')
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_money_pledges" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL
          REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "funding_need_id" uuid
          REFERENCES "campaign_funding_needs"("global_id") ON DELETE SET NULL,
        "user_id" uuid NOT NULL
          REFERENCES "users"("global_id") ON DELETE CASCADE,
        "pledged_amount" bigint NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'INTENDED',
        "show_name_publicly" boolean NOT NULL DEFAULT false,
        "note" varchar(500),
        "bank_account_id" uuid
          REFERENCES "campaign_bank_accounts"("global_id") ON DELETE SET NULL,
        "transfer_content" varchar(40) NOT NULL,
        "declared_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "hidden_at" timestamptz,
        "hidden_by" uuid REFERENCES "users"("global_id") ON DELETE SET NULL,
        "hidden_reason" varchar(500),
        CONSTRAINT "UQ_campaign_money_pledges_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_money_pledges_transfer_content" UNIQUE ("transfer_content"),
        CONSTRAINT "CHK_campaign_money_pledges_status"
          CHECK ("status" IN ('INTENDED', 'COMPLETED')),
        CONSTRAINT "CHK_campaign_money_pledges_amount"
          CHECK ("pledged_amount" >= 1000 AND "pledged_amount" <= 10000000000),
        CONSTRAINT "CHK_campaign_money_pledges_completed_at" CHECK (
          ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
          OR ("status" = 'INTENDED' AND "completed_at" IS NULL)),
        -- Người ẩn có thể bị xoá (hidden_by → NULL) nên chỉ ràng buộc lý do theo mốc ẩn.
        CONSTRAINT "CHK_campaign_money_pledges_hidden" CHECK (
          "hidden_at" IS NOT NULL OR ("hidden_by" IS NULL AND "hidden_reason" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_money_pledges_campaign" ON "campaign_money_pledges" ("campaign_id", "declared_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_money_pledges_user" ON "campaign_money_pledges" ("user_id", "declared_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_money_pledges_need" ON "campaign_money_pledges" ("funding_need_id") WHERE "funding_need_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "campaign_point_awards"
        DROP CONSTRAINT "CHK_campaign_point_awards_rule",
        ADD CONSTRAINT "CHK_campaign_point_awards_rule" CHECK ("rule_code" IN
          ('CHARITY_ITEM_VALUE', 'CHARITY_POST_VIDEO', 'CHARITY_POST_IMAGE',
           'CHARITY_PARTICIPATION', 'CHARITY_CAMPAIGN_BONUS', 'CHARITY_MONEY_PLEDGE'))
    `);

    await queryRunner.query(
      `INSERT INTO point_rules (code, points, is_enabled, affects_lifetime, daily_cap, version)
       VALUES ('CHARITY_MONEY_PLEDGE', 1, false, true, NULL, 1)
       ON CONFLICT DO NOTHING`,
    );

    for (const [key, value, reason] of IntegerConfigs)
      await queryRunner.query(
        `INSERT INTO "system_configs"
           ("config_key", "value_json", "value_type", "version", "status", "change_reason")
         VALUES ($1, $2::jsonb, 'INTEGER', 1, 'PUBLISHED', $3)
         ON CONFLICT DO NOTHING`,
        [key, String(value), reason],
      );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = ANY($1::text[])`,
      [IntegerConfigs.map(([key]) => key)],
    );
    // Sổ điểm append-only: chỉ xoá rule khi chưa có bút toán nào dùng nó.
    await queryRunner.query(
      `DELETE FROM point_rules rule WHERE rule.code = 'CHARITY_MONEY_PLEDGE'
         AND NOT EXISTS (SELECT 1 FROM point_ledger entry WHERE entry.rule_code = rule.code)`,
    );
    await queryRunner.query(
      `DELETE FROM "campaign_point_awards" WHERE "rule_code" = 'CHARITY_MONEY_PLEDGE'`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_point_awards"
        DROP CONSTRAINT "CHK_campaign_point_awards_rule",
        ADD CONSTRAINT "CHK_campaign_point_awards_rule" CHECK ("rule_code" IN
          ('CHARITY_ITEM_VALUE', 'CHARITY_POST_VIDEO', 'CHARITY_POST_IMAGE',
           'CHARITY_PARTICIPATION', 'CHARITY_CAMPAIGN_BONUS'))
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_money_pledges"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_bank_accounts"
        DROP CONSTRAINT IF EXISTS "CHK_campaign_bank_accounts_bank_bin",
        DROP COLUMN IF EXISTS "bank_bin"
    `);
  }
}
