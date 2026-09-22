import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hạn lưu trữ phòng chat và đường xoá có kiểm soát (F38).
 *
 * **`purge_after` là ảnh chụp, không phải phép tính.** Chốt một lần lúc khoá
 * phòng từ config tại thời điểm đó. Tính lại mỗi lần đọc thì báo với người dùng
 * "xoá sau 1 tuần" rồi Admin đổi thành 3 tuần là lời hứa và thực tế lệch nhau.
 *
 * Cột này kiêm luôn việc **giữ lại**: `NULL` nghĩa là không xoá. Admin cần giữ
 * chứng cứ một vụ tranh chấp thì xoá ngày đó đi, không cần thêm một cờ thứ hai
 * nói về cùng một chuyện.
 *
 * **Xoá tin nhắn, GIỮ phòng.** Xoá cả phòng thì mở lại lượt trao cũ ra `404`,
 * trông y như lỗi. Giữ phòng kèm `purged_at` và số tin đã xoá thì giao diện nói
 * được "tin nhắn đã xoá theo chính sách lưu trữ", và còn chứng minh được đã xoá
 * cái gì, lúc nào.
 *
 * **Cửa ra cho trigger chỉ-ghi-thêm.** Trigger cũ chặn `DELETE` vô điều kiện,
 * nên một job xoá định kỳ sẽ VỠ chứ không im lặng bỏ qua. Nới bằng một biến
 * phiên mà chỉ job xoá đặt (`SET LOCAL`), nên:
 *
 *   - `DELETE` lẻ tẻ từ chỗ khác vẫn bị chặn y như cũ
 *   - `UPDATE` vẫn bị chặn **tuyệt đối** — sửa lịch sử chat không bao giờ đúng
 *   - cờ chết theo transaction, không rò sang kết nối khác trong pool
 */
export class AddChatRetention1791400000000 implements MigrationInterface {
  name = 'AddChatRetention1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ADD COLUMN "purge_after" timestamptz,
      ADD COLUMN "purged_at" timestamptz,
      ADD COLUMN "purged_message_count" integer
    `);

    // Chỉ index những phòng THỰC SỰ đang chờ xoá. Phòng đang mở chưa có hạn, và
    // phòng đã xoá thì không cần quét lại — index đầy đủ sẽ phình theo toàn bộ
    // lịch sử trong khi vòng quét chỉ quan tâm một nhúm.
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_rooms_due_for_purge"
      ON "chat_rooms" ("purge_after")
      WHERE "purge_after" IS NOT NULL AND "purged_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat_messages_append_only()
      RETURNS trigger AS $$
      BEGIN
        -- Chi job xoa theo han luu tru duoc phep, va chi duoc XOA.
        IF TG_OP = 'DELETE'
           AND current_setting('chantam.chat_purge', true) = 'on' THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'chat_messages chi duoc ghi them, khong sua hoac xoa';
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat_messages_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'chat_messages chi duoc ghi them, khong sua hoac xoa';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP INDEX "IDX_chat_rooms_due_for_purge"`);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      DROP COLUMN "purged_message_count",
      DROP COLUMN "purged_at",
      DROP COLUMN "purge_after"
    `);
  }
}
