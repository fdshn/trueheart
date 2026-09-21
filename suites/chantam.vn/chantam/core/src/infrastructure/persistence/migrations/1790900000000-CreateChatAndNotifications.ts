import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat theo giao dịch (F37, F38) và thông báo trong app (F44).
 *
 * **Phòng chat gắn 1-1 với giao dịch.** `transaction_id` UNIQUE, nên không thể
 * có hai phòng cho một lượt trao — thứ mà hai lần duyệt chạy song song sẽ tạo
 * ra nếu chỉ kiểm ở tầng ứng dụng.
 *
 * **Vì sao có bảng phòng riêng thay vì suy ra từ `gift_transactions`.** Suy ra
 * được trạng thái, nhưng không suy ra được `last_message_at` (để xếp danh sách
 * hội thoại) và mốc đã đọc của từng bên. Hai thứ đó phải ghi, nên bảng tồn tại
 * có việc thật.
 *
 * **Mốc đã đọc là hai cột, không phải bảng phụ.** Chat là 1-1 theo đặc tả, đúng
 * hai người — một bảng participants chỉ thêm join mà không thêm khả năng nào.
 *
 * **`chat_messages` chỉ ghi thêm.** Không có `updated_at`, không có
 * `deleted_at`, và trigger chặn cả UPDATE lẫn DELETE — cùng quy ước với
 * `point_ledger` và `referrals`. F38 khoá chỉ đọc khi giao dịch xong, và lịch sử
 * chat là bằng chứng khi có tranh chấp hoặc report.
 *
 * Vì thế **không khoá ngoại nào ở đây dùng `ON DELETE CASCADE`**. Cascade và
 * chỉ-ghi-thêm loại trừ nhau: cascade sẽ cố xoá tin nhắn, trigger chặn lại, và
 * câu lệnh xoá vỡ giữa đường với một thông báo chẳng nói lên nguyên nhân. Hệ quả
 * là một lượt trao đã có lịch sử chat thì không xoá cứng được — đó chính là điều
 * đang muốn.
 */
export class CreateChatAndNotifications1790900000000 implements MigrationInterface {
  name = 'CreateChatAndNotifications1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."chat_rooms_status_enum"
      AS ENUM ('OPEN', 'READ_ONLY')
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_rooms" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "post_id" uuid NOT NULL,
        "giver_id" uuid NOT NULL,
        "receiver_id" uuid NOT NULL,
        "status" "public"."chat_rooms_status_enum" NOT NULL DEFAULT 'OPEN',
        "last_message_at" timestamptz,
        "giver_read_at" timestamptz,
        "receiver_read_at" timestamptz,
        "locked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_rooms" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_rooms_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_chat_rooms_transaction" UNIQUE ("transaction_id"),
        -- KHÔNG có ON DELETE CASCADE, dù giao dịch là cha. Cascade tới phòng
        -- rồi cascade tiếp tới tin nhắn sẽ đụng trigger chỉ-ghi-thêm và câu lệnh
        -- xoá vỡ giữa đường với một thông báo chẳng liên quan gì. Chặn ngay ở
        -- đây thì lỗi nói đúng chuyện: lượt trao có lịch sử chat không xoá được.
        CONSTRAINT "FK_chat_rooms_transaction"
          FOREIGN KEY ("transaction_id")
          REFERENCES "gift_transactions"("global_id"),
        CONSTRAINT "FK_chat_rooms_giver"
          FOREIGN KEY ("giver_id") REFERENCES "users"("global_id"),
        CONSTRAINT "FK_chat_rooms_receiver"
          FOREIGN KEY ("receiver_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_chat_rooms_distinct_participants"
          CHECK ("giver_id" <> "receiver_id"),
        CONSTRAINT "CHK_chat_rooms_locked_pairing"
          CHECK (
            ("status" = 'READ_ONLY' AND "locked_at" IS NOT NULL)
            OR ("status" = 'OPEN' AND "locked_at" IS NULL)
          )
      )
    `);

    // Danh sách hội thoại của một người, xếp theo tin mới nhất. Hai index vì
    // mỗi người xuất hiện ở một cột khác nhau tuỳ vai.
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_rooms_giver" ON "chat_rooms" ("giver_id", "last_message_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_rooms_receiver" ON "chat_rooms" ("receiver_id", "last_message_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "room_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "body" varchar(2000) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_messages_global_id" UNIQUE ("global_id"),
        -- Cũng không cascade: "chỉ ghi thêm" mà xoá được cả cụm theo phòng thì
        -- không còn là chỉ ghi thêm nữa.
        CONSTRAINT "FK_chat_messages_room"
          FOREIGN KEY ("room_id")
          REFERENCES "chat_rooms"("global_id"),
        CONSTRAINT "FK_chat_messages_sender"
          FOREIGN KEY ("sender_id") REFERENCES "users"("global_id"),
        CONSTRAINT "CHK_chat_messages_body_not_blank"
          CHECK (length(btrim("body")) > 0)
      )
    `);

    // Phân trang lịch sử theo thứ tự mới nhất trước; `id` phá thế hoà khi hai
    // tin cùng mốc thời gian, để trang 2 không lặp hoặc bỏ sót dòng.
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_room_created" ON "chat_messages" ("room_id", "created_at" DESC, "id" DESC)`,
    );

    // Chat chỉ ghi thêm: chặn ở database chứ không chỉ tin vào tầng ứng dụng.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION chat_messages_append_only()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'chat_messages chi duoc ghi them, khong sua hoac xoa';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_chat_messages_append_only"
      BEFORE UPDATE OR DELETE ON "chat_messages"
      FOR EACH ROW EXECUTE FUNCTION chat_messages_append_only()
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" varchar(64) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" varchar(1000) NOT NULL,
        "reference_type" varchar(64),
        "reference_id" uuid,
        "idempotency_key" varchar(200),
        "read_at" timestamptz,
        "pushed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notifications_global_id" UNIQUE ("global_id"),
        CONSTRAINT "UQ_notifications_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_notifications_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("global_id") ON DELETE CASCADE
      )
    `);

    // Hộp thư của một người: chưa đọc trước, rồi mới nhất trước.
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_inbox" ON "notifications" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_unread"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_inbox"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_chat_messages_append_only" ON "chat_messages"`,
    );
    await queryRunner.query(`DROP FUNCTION chat_messages_append_only()`);
    await queryRunner.query(`DROP INDEX "IDX_chat_messages_room_created"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP INDEX "IDX_chat_rooms_receiver"`);
    await queryRunner.query(`DROP INDEX "IDX_chat_rooms_giver"`);
    await queryRunner.query(`DROP TABLE "chat_rooms"`);
    await queryRunner.query(`DROP TYPE "public"."chat_rooms_status_enum"`);
  }
}
