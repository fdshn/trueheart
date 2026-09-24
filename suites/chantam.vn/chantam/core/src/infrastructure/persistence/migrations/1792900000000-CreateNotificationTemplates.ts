import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mẫu thông báo Admin sửa được lúc chạy (F62).
 *
 * **Khoá theo loại thông báo**, không phải một bảng mẫu tự do: mỗi loại có
 * đúng một mẫu, nên không có chuyện hai mẫu cùng tranh một sự kiện và không ai
 * biết cái nào thắng.
 *
 * **Seed đúng chữ đang hardcode trong code.** Bật lên không làm đổi một chữ
 * nào — đó là cách duy nhất để biết đường mẫu chạy đúng trước khi ai đó sửa
 * nội dung thật.
 *
 * **`is_enabled` mặc định `false`.** Mẫu tắt thì dispatch dùng chữ do nơi gọi
 * dựng, y như trước. Bật là một quyết định có chủ đích của Admin.
 */
export class CreateNotificationTemplates1792900000000 implements MigrationInterface {
  name = 'CreateNotificationTemplates1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id" SERIAL NOT NULL,
        "type" varchar(64) NOT NULL,
        "title" varchar(150) NOT NULL,
        "body" varchar(500) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_templates_type" UNIQUE ("type"),
        CONSTRAINT "CHK_notification_templates_title"
          CHECK (length(btrim("title")) > 0),
        CONSTRAINT "CHK_notification_templates_body"
          CHECK (length(btrim("body")) > 0),
        CONSTRAINT "FK_notification_templates_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users"("global_id")
          ON DELETE SET NULL
      )
    `);

    // Chữ y hệt bản đang hardcode — xem chat.use-cases.ts, transaction.use-cases.ts
    // và feed-notifications.ts. Chỗ trống dùng cú pháp {tên}.
    await queryRunner.query(`
      INSERT INTO "notification_templates" ("type", "title", "body") VALUES
        ('NEW_CHAT_MESSAGE',
         'Bạn có tin nhắn mới',
         '{preview}'),
        ('GIFT_REQUEST_ACCEPTED',
         'Yêu cầu của bạn đã được duyệt',
         'Cuộc trò chuyện với người tặng đã mở.'),
        ('GIFT_TRANSACTION_CLOSED',
         'Lượt trao đã huỷ, còn người đang chờ',
         'Một lượt trao vừa khép lại. Bạn có thể mở lại cơ hội cho người trong hàng đợi.'),
        ('GIFT_TRANSACTION_COMPLETED',
         'Lượt trao đã hoàn tất',
         'Người nhận đã xác nhận nhận được vật phẩm.'),
        ('CHAT_ROOM_SCHEDULED_FOR_PURGE',
         'Cuộc trò chuyện sẽ được xoá',
         'Tin nhắn của cuộc trò chuyện này sẽ được xoá vào ngày {purgeDate}.'),
        ('CONTENT_COMMENT_CREATED',
         'Bài của bạn có bình luận mới',
         '{preview}'),
        ('CONTENT_COMMENT_REPLIED',
         'Có người trả lời bình luận của bạn',
         '{preview}'),
        ('CONTENT_REACTION_FIRST_OF_DAY',
         'Bài của bạn nhận được cảm xúc',
         'Hôm nay có người bày tỏ cảm xúc với bài đăng của bạn.')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates"`);
  }
}
