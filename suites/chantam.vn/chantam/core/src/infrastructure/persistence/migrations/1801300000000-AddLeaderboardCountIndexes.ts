import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho ba truy vấn đếm theo tháng của bảng thành tích.
 *
 * Bảng tháng hiện tại được tính lại mỗi lần cache hết hạn. Index có sẵn đều bắt đầu bằng
 * NGƯỜI (`giver_id`, `user_id`) hoặc HOẠT ĐỘNG (`campaign_id`), nên lọc theo khoảng thời
 * gian thì phải quét cả bảng — và `check_in_entries` lớn thêm khoảng một dòng mỗi người mỗi
 * ngày. Partial theo đúng điều kiện của truy vấn để index chỉ chứa dòng được đếm.
 *
 * `test:leaderboard` nhóm 0 canh planner dùng được cả ba.
 */
export class AddLeaderboardCountIndexes1801300000000 implements MigrationInterface {
  name = 'AddLeaderboardCountIndexes1801300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gift_transactions_completed_month"
      ON "gift_transactions" ("completed_at") WHERE "status" = 'COMPLETED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_campaign_deliveries_completed_month"
      ON "campaign_deliveries" ("completed_at") WHERE "status" = 'COMPLETED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_check_in_entries_normal_month"
      ON "check_in_entries" ("policy_date") WHERE "kind" = 'NORMAL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_check_in_entries_normal_month"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaign_deliveries_completed_month"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gift_transactions_completed_month"`,
    );
  }
}
