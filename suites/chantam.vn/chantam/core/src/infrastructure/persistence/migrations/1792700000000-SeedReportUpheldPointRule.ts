import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rule thưởng cho báo xấu được Admin xác minh (F41).
 *
 * **TẮT sẵn**, giống hai rule tương tác còn lại: F41 ghi rõ "chỉ phát sinh
 * điểm khi Admin bật rule".
 *
 * **`affects_lifetime = false`.** `lifetime` là sàn của Rank; cho việc báo xấu
 * đẩy hạng thì cách rẻ nhất để lên Bạc là ngồi báo xấu cả ngày.
 *
 * **Trần 5 lượt mỗi ngày.** Trần làm chậm việc cày chứ không chặn được — chống
 * gian lận thật vẫn thuộc F50.
 */
export class SeedReportUpheldPointRule1792700000000 implements MigrationInterface {
  name = 'SeedReportUpheldPointRule1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO point_rules
        (code, points, is_enabled, affects_lifetime, daily_cap, version)
      VALUES ('REPORT_UPHELD', 5, false, false, 5, 1)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM point_rules WHERE code = 'REPORT_UPHELD'`,
    );
  }
}
