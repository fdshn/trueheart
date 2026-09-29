import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phạt chủ bài khi Admin xác nhận report nhắm vào bài đăng.
 *
 * Mức -50 là giá trị khởi tạo và có thể publish version mới qua CMS. Khoản
 * phạt không hạ lifetime để không viết lại lịch sử đóng góp đã xảy ra.
 *
 * **Mốc đổi từ 1794500000000 sang 1794550000000 (29/09) — đừng đổi lại.** Hai
 * migration từng dùng chung mốc 1794500000000. Nó chạy đúng vì `Array.sort` của
 * V8 ổn định nên giữ thứ tự khai trong `index.ts`, nhưng đó là một chỗ dựa
 * không nên dựa: sắp xếp lại danh sách export là đổi thứ tự chạy migration.
 *
 * Chọn dời file NÀY vì `up` của nó idempotent hoàn toàn (`ON CONFLICT DO
 * NOTHING` trên `UQ_point_rules_code_version`), nên database đã migrate sẽ chạy
 * lại nó một lần dưới tên mới và không có gì thay đổi.
 */
export class SeedContentViolationPenaltyRule1794550000000 implements MigrationInterface {
  name = 'SeedContentViolationPenaltyRule1794550000000';

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
