import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tắt/bật thông báo theo NHÓM — 29/09.
 *
 * Trước đó là tất-cả-hoặc-không, nên người bị làm phiền sẽ tắt thông báo ở mức
 * hệ điều hành và mất luôn `GIFT_REQUEST_ACCEPTED` — thứ thật sự quan trọng.
 *
 * **Lưu theo dòng "đã tắt" chứ không lưu cả bốn nhóm cho mọi người.** Đại đa số
 * không đụng tới cài đặt này, nên bảng chỉ chứa ngoại lệ: không có dòng nghĩa là
 * đang bật. Thêm một nhóm mới sau này cũng không phải backfill cho toàn bộ người
 * dùng.
 *
 * Mốc thời gian chứ không phải boolean: một dòng tồn tại đã đủ nghĩa "đã tắt",
 * còn `muted_at` cho biết từ lúc nào — hữu ích khi tra một khiếu nại kiểu "tôi
 * không nhận được thông báo nào cả".
 */
export class CreateNotificationPreferences1795100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_mutes" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "notification_group" varchar(32) NOT NULL,
        "muted_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_mutes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_mutes_user_group"
          UNIQUE ("user_id", "notification_group"),
        CONSTRAINT "FK_notification_mutes_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_mutes_user"
      ON "notification_mutes" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_mutes"`);
  }
}
