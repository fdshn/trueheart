import { MigrationInterface, QueryRunner } from 'typeorm';

const Key = 'charity.post_after_event_hours';

/**
 * Dự án từ thiện — cửa sổ đăng ảnh/clip sau sự kiện (docs/plan/CHARITY-PROJECT-LIFECYCLE.md
 * §3.5, chốt §7.3): participant đã check-in đăng thêm được 72 giờ sau khi dự án sang Tổng kết —
 * đủ để về tới nơi có mạng rồi mới tải. Admin chỉnh 0–720 (0 = tắt). Ban tổ chức đăng mọi lúc
 * như cũ.
 */
export class CharityPostAfterEventWindow1803200000000 implements MigrationInterface {
  name = 'CharityPostAfterEventWindow1803200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "system_configs"
         ("config_key", "value_json", "value_type", "version", "status", "change_reason")
       VALUES ($1, '72'::jsonb, 'INTEGER', 1, 'PUBLISHED',
               'Số giờ participant còn đăng ảnh/clip sau khi dự án sang Tổng kết.')
       ON CONFLICT DO NOTHING`,
      [Key],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = $1`,
      [Key],
    );
  }
}
