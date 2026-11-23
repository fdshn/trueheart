import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 22/11/2026 đợt 2 — đơn vị nhận có số suất / tiền ước tính / địa chỉ / giờ trao, sàn số
 * lượng theo suất, nhiều điểm tiếp nhận, khung tiếp nhận riêng.
 *
 * - `campaign_parties`: `estimated_portions`, `estimated_amount`, `location`, `distribution_at`.
 * - `campaign_need_items.quantity_per_portion` (≥ 1, mặc định 1).
 * - `campaign_funding_needs.receiving_unit` bỏ — đơn vị nhận là `campaign_parties`.
 * - `campaigns.intake_ends_at`: điền từ PREPARATION.ends_at → DISTRIBUTION.starts_at →
 *   end_time (§3.16). Không kiểm thứ tự trong SQL — luật nằm ở `charityScheduleGaps`.
 * - `campaign_intake_locations`: chép một điểm từ `location_label`/`location` cũ.
 * - Cấu hình `charity.max_beneficiaries_per_campaign` (20), `charity.max_intake_locations` (10).
 */
export class CharityBeneficiaryPlanAndSchedule1804100000000 implements MigrationInterface {
  name = 'CharityBeneficiaryPlanAndSchedule1804100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_parties"
        ADD COLUMN "estimated_portions" integer NOT NULL DEFAULT 0,
        ADD COLUMN "estimated_amount" bigint NOT NULL DEFAULT 0,
        ADD COLUMN "location" geography(Point, 4326),
        ADD COLUMN "distribution_at" timestamptz,
        ADD CONSTRAINT "CHK_campaign_parties_estimated_portions"
          CHECK ("estimated_portions" >= 0),
        ADD CONSTRAINT "CHK_campaign_parties_estimated_amount"
          CHECK ("estimated_amount" >= 0)
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_parties_location" ON "campaign_parties" USING GIST ("location")`,
    );

    await queryRunner.query(`
      ALTER TABLE "campaign_need_items"
        ADD COLUMN "quantity_per_portion" integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT "CHK_campaign_need_items_quantity_per_portion"
          CHECK ("quantity_per_portion" >= 1)
    `);

    await queryRunner.query(
      `ALTER TABLE "campaign_funding_needs" DROP COLUMN "receiving_unit"`,
    );

    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN "intake_ends_at" timestamptz`,
    );
    await queryRunner.query(`
      UPDATE "campaigns" campaign
         SET "intake_ends_at" = COALESCE(
           (SELECT phase."ends_at" FROM "campaign_phases" phase
             WHERE phase."campaign_id" = campaign."global_id"
               AND phase."phase" = 'PREPARATION'),
           (SELECT phase."starts_at" FROM "campaign_phases" phase
             WHERE phase."campaign_id" = campaign."global_id"
               AND phase."phase" = 'DISTRIBUTION'),
           campaign."end_time")
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_intake_locations" (
        "id" BIGSERIAL PRIMARY KEY,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL REFERENCES "campaigns"("global_id") ON DELETE CASCADE,
        "position" smallint NOT NULL,
        "label" varchar(200) NOT NULL,
        "address" varchar(500),
        "location" geography(Point, 4326),
        "schedule_note" varchar(300),
        "contact_name" varchar(200),
        "contact_phone" varchar(30),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_campaign_intake_locations_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_campaign_intake_locations_position" UNIQUE ("campaign_id", "position"),
        CONSTRAINT "CHK_campaign_intake_locations_label" CHECK (length(btrim("label")) > 0),
        CONSTRAINT "CHK_campaign_intake_locations_position" CHECK ("position" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_intake_locations_location" ON "campaign_intake_locations" USING GIST ("location")`,
    );
    await queryRunner.query(`
      INSERT INTO "campaign_intake_locations" ("campaign_id", "position", "label", "location")
      SELECT "global_id", 0,
             COALESCE(NULLIF(btrim("location_label"), ''), 'Điểm tiếp nhận'), "location"
        FROM "campaigns"
       WHERE NULLIF(btrim("location_label"), '') IS NOT NULL OR "location" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES
        ('charity.max_beneficiaries_per_campaign', '20', 'INTEGER', 1, 'PUBLISHED',
         'Số đơn vị nhận tối đa của một chiến dịch từ thiện (CR 22/11/2026).'),
        ('charity.max_intake_locations', '10', 'INTEGER', 1, 'PUBLISHED',
         'Số điểm tiếp nhận tối đa của một chiến dịch từ thiện (CR 22/11/2026).')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_configs"
       WHERE "config_key" IN ('charity.max_beneficiaries_per_campaign',
                              'charity.max_intake_locations')
    `);
    await queryRunner.query(`DROP TABLE "campaign_intake_locations"`);
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN "intake_ends_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaign_funding_needs" ADD COLUMN "receiving_unit" varchar(200)`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaign_need_items"
        DROP CONSTRAINT "CHK_campaign_need_items_quantity_per_portion",
        DROP COLUMN "quantity_per_portion"
    `);
    await queryRunner.query(`DROP INDEX "IDX_campaign_parties_location"`);
    await queryRunner.query(`
      ALTER TABLE "campaign_parties"
        DROP CONSTRAINT "CHK_campaign_parties_estimated_portions",
        DROP CONSTRAINT "CHK_campaign_parties_estimated_amount",
        DROP COLUMN "estimated_portions",
        DROP COLUMN "estimated_amount",
        DROP COLUMN "location",
        DROP COLUMN "distribution_at"
    `);
  }
}
