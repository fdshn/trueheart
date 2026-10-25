import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rao vặt chỉ đăng tin và liên hệ (PR #46 §8).
 *
 * - Thêm `SOLD`, `HIDDEN` vào trạng thái bài. `ACTIVE` của Rao vặt là `PUBLISHED` sẵn có.
 *   Postgres 12+ cho `ADD VALUE` trong transaction; giá trị mới chỉ được DÙNG sau commit, và
 *   migration này không dùng tới.
 * - Khoá `classified.legacy_transactions_enabled` = 0: chặn yêu cầu xin nhận và lượt trao
 *   MỚI cho Rao vặt. Lịch sử cũ giữ nguyên; lượt trao đang dở vẫn đi tiếp được.
 */
export class ClassifiedListingLifecycle1801600000000 implements MigrationInterface {
  name = 'ClassifiedListingLifecycle1801600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."gift_posts_status_enum" ADD VALUE IF NOT EXISTS 'SOLD'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."gift_posts_status_enum" ADD VALUE IF NOT EXISTS 'HIDDEN'`,
    );
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES ('classified.legacy_transactions_enabled', '0', 'INTEGER', 1, 'PUBLISHED',
              'Rao vặt chỉ đăng tin và liên hệ (PR #46 §8). 1 = bật lại xin nhận/lượt trao cũ.')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Gỡ giá trị enum đòi dựng lại cả type; giữ lại như `DELIVERING` từng được giữ.
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'classified.legacy_transactions_enabled'`,
    );
  }
}
