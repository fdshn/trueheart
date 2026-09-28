import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thu hồi tin nhắn, và báo xấu nhắm vào một tin nhắn cụ thể — 28/09.
 *
 * ## Vì sao đục một lỗ vào trigger append-only
 *
 * `chat_messages` cấm sửa và xoá để không ai âm thầm viết lại lịch sử trao đổi —
 * và đó là lý do §9.1 giữ phòng thay vì xoá khi lượt trao đóng. Nhưng đây cũng
 * CHÍNH LÀ nơi hai bên trao số điện thoại và địa chỉ thật, nên dán nhầm vào
 * phòng khác là một chuyện sẽ xảy ra, và hiện không gỡ được kể cả một giây sau.
 *
 * Lỗ được đục hẹp nhất có thể:
 *
 * - Chỉ cho `UPDATE`, không cho `DELETE` — dòng vẫn còn nguyên chỗ trong cuộc
 *   trò chuyện, chỉ rỗng nội dung. Ai đọc lại vẫn thấy "ở đây từng có một tin".
 * - Chỉ khi cờ phiên `chantam.chat_recall` được bật, y như cách job dọn phải
 *   khai `chantam.chat_purge`. Không có miễn trừ ngầm.
 * - Chỉ được phép đặt `recalled_at` và làm rỗng `body`/`media_count`. Đổi
 *   `sender_id`, `room_id` hay `created_at` vẫn bị chặn — thu hồi là xoá lời
 *   mình nói, không phải sửa ai đã nói gì lúc nào.
 *
 * ## Báo xấu một tin nhắn
 *
 * Trước đó `reports` chỉ nhận `POST`/`USER`/`COMMENT`, nên người bị quấy rối
 * trong chat chỉ báo được cả CON NGƯỜI, và Admin mở hàng đợi ra thì không có gì
 * để xem. Thêm `CHAT_MESSAGE` để báo xấu trỏ đúng vào dòng cần đọc.
 */
export class AddChatRecallAndMessageReports1794900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN IF NOT EXISTS "recalled_at" timestamptz
    `);

    // Ràng buộc cũ đòi tin phải có chữ HOẶC ảnh — đúng cho tin đang sống, nhưng
    // tin đã thu hồi thì rỗng cả hai là ĐÚNG Ý. Nới đúng một nhánh, không bỏ
    // ràng buộc: tin chưa thu hồi vẫn không được để trống.
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "CHK_chat_messages_body_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "CHK_chat_messages_body_not_blank"
      CHECK (
        "recalled_at" IS NOT NULL
        OR length(btrim("body")) > 0
        OR "media_count" > 0
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat_messages_append_only()
      RETURNS trigger AS $$
      BEGIN
        -- Job xoa theo han luu tru: duoc XOA, va chi khi khai co phien.
        IF TG_OP = 'DELETE'
           AND current_setting('chantam.chat_purge', true) = 'on' THEN
          RETURN OLD;
        END IF;

        -- Thu hoi: duoc SUA, chi khi khai co phien, va chi duoc lam rong noi
        -- dung cua chinh dong do. Moi cot dinh danh phai giu nguyen.
        IF TG_OP = 'UPDATE'
           AND current_setting('chantam.chat_recall', true) = 'on'
           AND OLD."recalled_at" IS NULL
           AND NEW."recalled_at" IS NOT NULL
           AND NEW."body" = ''
           AND NEW."media_count" = 0
           AND NEW."global_id" = OLD."global_id"
           AND NEW."room_id" = OLD."room_id"
           AND NEW."sender_id" = OLD."sender_id"
           AND NEW."created_at" = OLD."created_at" THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'chat_messages chi duoc ghi them, tru thu hoi va don theo han';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum"
      AS ENUM ('POST', 'USER', 'COMMENT', 'CHAT_MESSAGE')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_old"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "reports" WHERE "target_type" = 'CHAT_MESSAGE'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."reports_target_type_enum"
      RENAME TO "reports_target_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."reports_target_type_enum"
      AS ENUM ('POST', 'USER', 'COMMENT')
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ALTER COLUMN "target_type" TYPE "public"."reports_target_type_enum"
      USING "target_type"::text::"public"."reports_target_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."reports_target_type_enum_old"`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat_messages_append_only()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE'
           AND current_setting('chantam.chat_purge', true) = 'on' THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'chat_messages chi duoc ghi them, khong sua hoac xoa';
      END;
      $$ LANGUAGE plpgsql
    `);

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
      ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "recalled_at"
    `);
  }
}
