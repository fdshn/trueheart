import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phạt chủ bài khi Admin xác nhận report nhắm vào bài đăng.
 *
 * Mức -50 là giá trị khởi tạo và có thể publish version mới qua CMS. Khoản
 * phạt không hạ lifetime để không viết lại lịch sử đóng góp đã xảy ra.
 */
export class SeedContentViolationPenaltyRule1794500000000 implements MigrationInterface {
  name = 'SeedContentViolationPenaltyRule1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, is_enabled, affects_lifetime, daily_cap, version)
      VALUES ('CONTENT_VIOLATION_PENALTY', -50, true, false, NULL, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM point_rules WHERE code = 'CONTENT_VIOLATION_PENALTY'`,
    );
  }
}
