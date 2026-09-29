import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ngưỡng nhận diện báo xấu ác ý — 29/09.
 *
 * `normalizeReportAbuseConfig` vốn đã lùi về mặc định khi thiếu, nên không seed thì
 * mọi thứ VẪN chạy đúng. Nhưng Admin mở trang cấu hình ra sẽ không thấy ô nào để
 * sửa, và một ngưỡng chỉ tồn tại trong code là một ngưỡng phải deploy mới đổi được
 * — đúng thứ mà `system_configs` được dựng ra để tránh.
 */
export class SeedReportAbuseConfig1795500000000 implements MigrationInterface {
  name = 'SeedReportAbuseConfig1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES (
        'report.abuse',
        '{"minSamples": 5, "dismissedRatioPercent": 80}',
        'JSON', 1, 'PUBLISHED',
        'Ngưỡng đưa người báo xấu vào diện Admin xem xét: số lượt ĐÃ có kết luận tối thiểu, và tỷ lệ bị bác từ mức đó trở lên. KHÔNG tự động phạt — chỉ đưa hồ sơ lên bàn Admin'
      )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'report.abuse'`,
    );
  }
}
