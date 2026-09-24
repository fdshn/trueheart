import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh trong tin nhắn chat (đảo quyết định "chỉ text" của F37).
 *
 * Ba thứ không hiển nhiên:
 *
 * **1. Ràng buộc "nội dung không rỗng" phải đổi.** Một tin chỉ có ảnh thì không
 * có chữ. `CHECK` không nhìn sang bảng khác được, nên số ảnh phải nằm trên
 * chính dòng tin nhắn: `length(btrim(body)) > 0 OR media_count > 0`.
 *
 * **2. `media_count` chỉ đặt được lúc INSERT.** Trigger `chat_messages_append_only`
 * chặn tuyệt đối mọi `UPDATE`, nên không có chuyện tạo tin rồi cộng dồn số ảnh
 * sau. `ALTER TABLE ADD COLUMN` là DDL nên không chạm trigger dòng; mọi tin cũ
 * nhận `0` qua `DEFAULT`.
 *
 * **3. `ON DELETE CASCADE` để xoá chat theo hạn cuốn luôn dòng ảnh.** Còn xoá
 * object trên storage thì phải làm SAU khi commit, ở tầng ứng dụng — xoá object
 * không nằm trong transaction database được.
 */
export class AddChatMessageMedia1792400000000 implements MigrationInterface {
  name = 'AddChatMessageMedia1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN IF NOT EXISTS "media_count" integer NOT NULL DEFAULT 0
    `);

    // Nới ràng buộc cũ: tin chỉ có ảnh là hợp lệ, nhưng rỗng cả chữ lẫn ảnh thì
    // không. Trần 3 ảnh cũng do database giữ, không để tầng ứng dụng tự hứa.
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "CHK_chat_messages_body_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "CHK_chat_messages_body_not_blank"
        CHECK (length(btrim("body")) > 0 OR "media_count" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "CHK_chat_messages_media_count"
        CHECK ("media_count" BETWEEN 0 AND 3)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_message_media" (
        "id" BIGSERIAL NOT NULL,
        "message_id" uuid NOT NULL,
        "room_id" uuid NOT NULL,
        "slot" smallint NOT NULL,
        "storage_key" varchar(500) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_message_media" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_message_media_key" UNIQUE ("storage_key"),
        CONSTRAINT "UQ_chat_message_media_slot" UNIQUE ("message_id", "slot"),
        CONSTRAINT "CHK_chat_message_media_slot" CHECK ("slot" BETWEEN 1 AND 3),
        CONSTRAINT "FK_chat_message_media_message"
          FOREIGN KEY ("message_id") REFERENCES "chat_messages"("global_id")
          ON DELETE CASCADE
      )
    `);

    // Gom key theo phòng khi xoá chat theo hạn: không có index này thì mỗi lần
    // dọn là một lần quét toàn bảng.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_message_media_room"
      ON "chat_message_media" ("room_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_chat_message_media_room"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_message_media"`);

    // Trả lại ràng buộc cũ. Tin chỉ có ảnh sẽ vi phạm, nên xoá chúng trước —
    // nội dung của chúng nằm ở bảng vừa drop, giữ lại cũng chỉ là dòng rỗng.
    // Trigger `chat_messages_append_only` chặn mọi DELETE trừ khi cờ dọn được
    // bật, và đây đúng là một lần dọn có chủ đích.
    await queryRunner.query(`SET LOCAL "chantam.chat_purge" = 'on'`);
    await queryRunner.query(`
      DELETE FROM "chat_messages" WHERE length(btrim("body")) = 0
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "CHK_chat_messages_media_count"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "CHK_chat_messages_body_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "CHK_chat_messages_body_not_blank"
        CHECK (length(btrim("body")) > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "media_count"
    `);
  }
}
