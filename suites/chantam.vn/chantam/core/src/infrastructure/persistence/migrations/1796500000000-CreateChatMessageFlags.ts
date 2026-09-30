import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cờ kiểm duyệt cho tin nhắn chat — 30/09.
 *
 * ## Vì sao cần
 *
 * `screenText` tới nay CHỈ chạy trên bình luận. Chat không qua bộ lọc nào. Nhưng
 * Bên A xác nhận **mọi thương lượng diễn ra qua chat** — nên 14 mục dấu hiệu lừa
 * đảo và 8 mục kéo ra ngoài nền tảng đang canh một kênh công khai, trong khi cuộc
 * hội thoại thật nằm ở chỗ không ai soi.
 *
 * ## Vì sao GẮN CỜ, không CHẶN
 *
 * Chốt của Bên A. Chat là hội thoại riêng giữa người tặng và người nhận, và một
 * dương tính giả ở đó làm đứng cả cuộc bàn giao — "đặt cọc" trong câu "mình không
 * cần đặt cọc gì đâu" là ví dụ. Tin vẫn tới nơi; Admin xem sau, và gỡ bằng
 * `DELETE /admin/chat/messages/:messageId` nếu cần.
 *
 * Nên `severity` được LƯU LẠI chứ không dùng để quyết định chặn: nó chỉ xếp thứ
 * tự hàng đợi. Cùng một danh sách từ, hai kênh hai cách xử lý.
 *
 * ## Vì sao bảng RIÊNG, không thêm cột vào `chat_messages`
 *
 * `chat_messages` có trigger `TRG_chat_messages_append_only` chặn mọi UPDATE và
 * DELETE — cố ý, vì lịch sử chat là bằng chứng cho tranh chấp. Đặt cờ vào đó thì
 * thao tác "Admin đã xem" phải mở cửa hậu bằng session variable như
 * `chantam.chat_recall`, tức nới một bất biến đang bảo vệ đúng thứ cần bảo vệ.
 *
 * Bảng riêng thì `chat_messages` giữ nguyên tính chỉ-ghi-thêm, và hàng đợi Admin
 * cập nhật được bình thường.
 *
 * ## Ghi cùng transaction với tin nhắn
 *
 * `appendMessage` chèn cả hai trong một transaction. Ghi cờ ở lượt riêng sau đó là
 * mở một cửa: lượt thứ hai thất bại thì tin nhắn đã vào nhưng cờ mất, và không ai
 * biết mình vừa mất một tín hiệu. Thà không lưu được tin nhắn còn hơn lưu một tin
 * đáng soi mà không ai soi.
 */
export class CreateChatMessageFlags1796500000000 implements MigrationInterface {
  name = 'CreateChatMessageFlags1796500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."chat_flag_actions_enum"
        AS ENUM ('DISMISSED', 'MESSAGE_REMOVED', 'USER_WARNED')
    `);
    await queryRunner.query(`
      CREATE TABLE "chat_message_flags" (
        "id" BIGSERIAL NOT NULL,
        "global_id" uuid NOT NULL,
        "message_id" uuid NOT NULL,
        "room_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        -- Mức nặng nhất trong các mục đã khớp. CHỈ để xếp thứ tự hàng đợi —
        -- chat không chặn, xem docblock.
        "severity" varchar(20) NOT NULL,
        -- Những mục đã khớp, dạng ĐÃ CHUẨN HOÁ đúng như bộ lọc thấy. Lưu dạng
        -- chuẩn hoá chứ không dạng gốc: Admin cần biết vì sao nó khớp, và dạng gốc
        -- không giải thích được "sung túc" khớp mục "súng".
        "matched_terms" text[] NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "reviewed_at" timestamptz,
        "reviewed_by" uuid,
        "action" "public"."chat_flag_actions_enum",
        "review_note" varchar(500),
        CONSTRAINT "PK_chat_message_flags" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_message_flags_global_id" UNIQUE ("global_id"),
        -- Một tin nhắn một cờ. Bộ lọc chạy đúng một lần lúc gửi, nên dòng thứ hai
        -- chỉ có thể là lỗi ghi trùng.
        CONSTRAINT "UQ_chat_message_flags_message" UNIQUE ("message_id"),
        CONSTRAINT "FK_chat_message_flags_message"
          FOREIGN KEY ("message_id") REFERENCES "chat_messages"("global_id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_chat_message_flags_reviewer"
          FOREIGN KEY ("reviewed_by") REFERENCES users("global_id") ON DELETE SET NULL,
        -- Đã xem thì phải có mốc VÀ có quyết định, và ngược lại. Thiếu một nửa là
        -- một dòng nói "đã xử" mà không nói xử thế nào.
        CONSTRAINT "CHK_chat_message_flags_review" CHECK (
          ("reviewed_at" IS NULL) = ("action" IS NULL)
        ),
        CONSTRAINT "CHK_chat_message_flags_terms" CHECK (
          array_length("matched_terms", 1) >= 1
        )
      )
    `);
    // Hàng đợi đọc theo "chưa xem, nặng trước, cũ trước". Index một phần vì dòng
    // đã xem không bao giờ xuất hiện trong hàng đợi nữa.
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_message_flags_pending"
      ON "chat_message_flags" ("severity", "created_at")
      WHERE "reviewed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_message_flags_sender"
      ON "chat_message_flags" ("sender_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_message_flags"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."chat_flag_actions_enum"`,
    );
  }
}
