import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat trực tiếp theo bài Rao vặt (PR #46 §7), chạy song song chat giao dịch.
 *
 * Dùng LẠI bảng `chat_rooms`, không tạo bảng thứ hai: tin nhắn, ảnh, đã đọc, tắt tiếng, thu
 * hồi, báo xấu và realtime đều treo vào `chat_rooms.global_id`. Một bảng phòng mới là viết lại
 * tất cả những thứ đó.
 *
 * `giver_id` = người bán (chủ bài), `receiver_id` = người mua (người mở phòng). Giữ hai cột cũ
 * để mọi phép kiểm "là một trong hai bên" chạy y nguyên.
 *
 * - `TRANSACTION`: bắt buộc `transaction_id`, unique theo giao dịch như trước.
 * - `DIRECT_POST`: không có giao dịch, unique theo (bài, người mua, người bán) — cùng hai người
 *   nhưng hai bài khác nhau là hai phòng khác nhau.
 *
 * Không đặt `purge_after`: hạn lưu của chat giao dịch không tự áp sang chat trực tiếp.
 */
export class AddDirectPostChat1801500000000 implements MigrationInterface {
  name = 'AddDirectPostChat1801500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."chat_rooms_room_type_enum" AS ENUM ('TRANSACTION', 'DIRECT_POST')
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        ADD COLUMN "room_type" "public"."chat_rooms_room_type_enum" NOT NULL DEFAULT 'TRANSACTION',
        ALTER COLUMN "transaction_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        ADD CONSTRAINT "CHK_chat_rooms_type_transaction"
          CHECK (("room_type" = 'TRANSACTION') = ("transaction_id" IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_chat_rooms_direct_post"
      ON "chat_rooms" ("post_id", "receiver_id", "giver_id")
      WHERE "room_type" = 'DIRECT_POST'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Phòng trực tiếp có tin nhắn chỉ-ghi-thêm treo vào; down chỉ chạy được trên database
    // chưa có phòng trực tiếp nào — đúng là điều nên xảy ra.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_rooms_direct_post"`);
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" DROP CONSTRAINT IF EXISTS "CHK_chat_rooms_type_transaction"`,
    );
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        ALTER COLUMN "transaction_id" SET NOT NULL,
        DROP COLUMN "room_type"
    `);
    await queryRunner.query(`DROP TYPE "public"."chat_rooms_room_type_enum"`);
  }
}
