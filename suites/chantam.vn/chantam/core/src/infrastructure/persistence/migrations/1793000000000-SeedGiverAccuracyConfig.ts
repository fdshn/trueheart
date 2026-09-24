import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đưa hai ngưỡng Giver Accuracy ra cho Admin cấu hình (F61).
 *
 * Trước đó chúng là hằng trong code, nên đổi một con số phải chờ deploy —
 * trong khi đây đúng là loại số cần chỉnh theo dữ liệu thật sau vài tuần chạy.
 *
 * Giá trị seed y hệt hằng cũ, nên migration này không làm đổi kết quả của bất
 * kỳ tài khoản nào.
 */
export class SeedGiverAccuracyConfig1793000000000 implements MigrationInterface {
  name = 'SeedGiverAccuracyConfig1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES (
        'accuracy.giver',
        '{"minSamples": 5, "reviewThresholdPercent": 75}',
        'JSON', 1, 'PUBLISHED',
        'Ngưỡng Giver Accuracy: số mẫu tối thiểu trước khi công bố chỉ số, và mức phần trăm dưới đó thì đưa hồ sơ vào diện Admin xem xét (KHÔNG tự động phạt)'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'accuracy.giver'`,
    );
  }
}
