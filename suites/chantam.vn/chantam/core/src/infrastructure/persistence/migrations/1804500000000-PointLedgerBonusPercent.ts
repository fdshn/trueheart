import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR 22/11/2026 — review M6: bút toán thưởng hệ số chiến dịch (`CHARITY_CAMPAIGN_BONUS`) ghi lại
 * HỆ SỐ lúc ghi. Bảng tin điểm hiện hệ số này, không phải hệ số hiện tại của chiến dịch (Admin
 * có thể đổi sau đó). Bút toán khác để `NULL`.
 */
export class PointLedgerBonusPercent1804500000000 implements MigrationInterface {
  name = 'PointLedgerBonusPercent1804500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
        ADD COLUMN "bonus_percent" smallint,
        ADD CONSTRAINT "CHK_point_ledger_bonus_percent"
          CHECK ("bonus_percent" IS NULL OR "bonus_percent" IN (20, 50, 100))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "point_ledger"
        DROP CONSTRAINT IF EXISTS "CHK_point_ledger_bonus_percent",
        DROP COLUMN IF EXISTS "bonus_percent"
    `);
  }
}
