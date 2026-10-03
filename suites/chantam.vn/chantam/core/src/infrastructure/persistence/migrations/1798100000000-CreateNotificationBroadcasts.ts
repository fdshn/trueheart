import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lượt gửi thông báo hàng loạt (F47, SRS mục 1507).
 *
 * ## Vì sao một bảng, không phải gửi thẳng rồi quên
 *
 * Hai lý do, và lý do thứ hai nặng hơn.
 *
 * **Kỹ thuật:** gửi đồng bộ cho trăm nghìn người trong một request HTTP là hết giờ. `POST`
 * ghi một hàng `PENDING` rồi trả ngay; CLI xử lý theo lô.
 *
 * **Nghiệp vụ:** một lượt gửi tới toàn bộ người dùng là hành động KHÔNG RÚT LẠI được —
 * người ta đọc rồi. Không có bản ghi thì sáu tháng sau không ai trả lời được "tấm thông báo
 * đó từ đâu ra, ai gửi, gửi cho bao nhiêu người". `admin_audit_logs` ghi được lượt tạo,
 * nhưng không ghi được KẾT QUẢ — và kết quả là phần Admin cần khi có người phàn nàn.
 *
 * ## `last_user_id` là con trỏ tiếp tục, không phải thống kê
 *
 * Trăm nghìn người là vài phút chạy. Mất kết nối ở người thứ 60.000 mà không có con trỏ thì
 * lượt chạy lại bắt đầu từ đầu — khoá chống trùng vẫn chặn gửi lại, nhưng nó phải đi qua
 * 60.000 lượt gọi vô ích trước khi tới chỗ còn dở.
 *
 * ## Ràng buộc buộc ba chế độ mang đúng tham số của mình
 *
 * `ALL` mà vẫn mang `group_id` là một hàng không ai đọc nổi: nó có lọc hay không? Nên
 * `CHK_notification_broadcasts_audience` buộc mỗi chế độ chỉ mang tham số của nó, và
 * KHÔNG mang tham số của chế độ khác.
 */
export class CreateNotificationBroadcasts1798100000000 implements MigrationInterface {
  name = 'CreateNotificationBroadcasts1798100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_broadcasts" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "audience_type" varchar(16) NOT NULL,
        "group_id" uuid,
        "center_location" geography(Point, 4326),
        "radius_meters" int,
        "notification_type" varchar(64) NOT NULL,
        "title" varchar(150) NOT NULL,
        "body" varchar(1000) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "audience_count" int NOT NULL DEFAULT 0,
        "notified_count" int NOT NULL DEFAULT 0,
        "already_sent_count" int NOT NULL DEFAULT 0,
        "failed_count" int NOT NULL DEFAULT 0,
        -- Con trỏ tiếp tục. Xem docblock.
        "last_user_id" bigint NOT NULL DEFAULT 0,
        "failure_reason" varchar(500),
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "started_at" timestamptz,
        "completed_at" timestamptz,
        CONSTRAINT "PK_notification_broadcasts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_broadcasts_global_id" UNIQUE ("global_id"),
        CONSTRAINT "FK_notification_broadcasts_creator"
          FOREIGN KEY ("created_by") REFERENCES users("global_id") ON DELETE SET NULL,
        CONSTRAINT "FK_notification_broadcasts_group"
          FOREIGN KEY ("group_id") REFERENCES groups("global_id") ON DELETE SET NULL,
        CONSTRAINT "CHK_notification_broadcasts_audience_type"
          CHECK ("audience_type" IN ('ALL', 'GROUP', 'AREA')),
        CONSTRAINT "CHK_notification_broadcasts_status"
          CHECK ("status" IN ('PENDING', 'SENDING', 'COMPLETED', 'FAILED')),
        -- Mỗi chế độ mang ĐÚNG tham số của mình, và không mang của chế độ khác.
        CONSTRAINT "CHK_notification_broadcasts_audience"
          CHECK (
            ("audience_type" = 'ALL'
              AND "group_id" IS NULL
              AND "center_location" IS NULL
              AND "radius_meters" IS NULL)
            OR ("audience_type" = 'GROUP'
              AND "group_id" IS NOT NULL
              AND "center_location" IS NULL
              AND "radius_meters" IS NULL)
            OR ("audience_type" = 'AREA'
              AND "group_id" IS NULL
              AND "center_location" IS NOT NULL
              AND "radius_meters" > 0)
          ),
        CONSTRAINT "CHK_notification_broadcasts_counts"
          CHECK ("audience_count" >= 0 AND "notified_count" >= 0
                 AND "already_sent_count" >= 0 AND "failed_count" >= 0
                 AND "last_user_id" >= 0),
        -- Đã xong thì phải có mốc xong, chưa xong thì phải không có. Cùng lối
        -- CHK_blogs_published_at: hai cột cho một trạng thái thì để database canh.
        CONSTRAINT "CHK_notification_broadcasts_completed_at"
          CHECK (
            ("status" IN ('COMPLETED', 'FAILED') AND "completed_at" IS NOT NULL)
            OR ("status" IN ('PENDING', 'SENDING') AND "completed_at" IS NULL)
          )
      )
    `);

    // Truy vấn của CLI: lấy lượt gửi cũ nhất còn dở. `SENDING` cũng vào đây — một lượt
    // chạy chết giữa đường để lại trạng thái đó, và nó phải được nhặt lại chứ không treo
    // mãi.
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_broadcasts_pending"
        ON "notification_broadcasts" ("created_at" ASC)
        WHERE "status" IN ('PENDING', 'SENDING')
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_broadcasts_recent"
        ON "notification_broadcasts" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_broadcasts_recent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_broadcasts_pending"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_broadcasts"`);
  }
}
