import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phòng chat trực tiếp giữa hai người dùng — `DIRECT_USER` (yêu cầu 30/10).
 *
 * Không giao dịch, không bài đăng: mở từ danh sách online hoặc hồ sơ.
 *
 * ## Thêm giá trị enum bằng cách dựng lại type
 *
 * `ALTER TYPE … ADD VALUE` không DÙNG được trong cùng transaction, mà CHECK và unique index dưới
 * đây cần dùng ngay `DIRECT_USER`. Nên đi lối của 1792300000000/1799100000000: đổi tên type cũ,
 * dựng type mới, chuyển cột. Cột `room_type` đang có default, một CHECK và một unique index một
 * phần tham chiếu tới type — phải gỡ ra trước và dựng lại sau.
 *
 * ## Một phòng cho mỗi cặp người, bất kể ai mở trước
 *
 * Unique index trên `(LEAST(giver_id, receiver_id), GREATEST(…))`: A mở với B và B mở với A ra
 * đúng một phòng, kể cả khi hai người bấm cùng lúc. Repository còn lưu sẵn theo thứ tự đã chuẩn
 * hoá (`giver_id` < `receiver_id`) cho phòng loại này, nên hai cột không mang nghĩa người tặng/
 * người nhận ở đây.
 *
 * ## Ai mở phòng — để giới hạn số phòng mới mỗi ngày
 *
 * `created_by`: người bấm mở. Chỉ có ở phòng `DIRECT_USER`; đếm theo nó để chặn một tài khoản mở
 * hàng trăm phòng spam (`chat.direct_user_daily_limit`).
 *
 * ## Cài đặt nhận tin người lạ
 *
 * `users.allow_stranger_messages` mặc định BẬT: ai cũng nhắn được. Tắt thì chỉ người đã từng có
 * phòng chat (bất kỳ loại nào) với mình mới mở được phòng trực tiếp mới.
 */
export class AddDirectUserChat1802200000000 implements MigrationInterface {
  name = 'AddDirectUserChat1802200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Gỡ những thứ tham chiếu type cũ ────────────────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chat_rooms_direct_post"`);
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" DROP CONSTRAINT IF EXISTS "CHK_chat_rooms_type_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" ALTER COLUMN "room_type" DROP DEFAULT`,
    );

    // ── Dựng lại type với DIRECT_USER ─────────────────────────────────────
    await queryRunner.query(
      `ALTER TYPE "public"."chat_rooms_room_type_enum" RENAME TO "chat_rooms_room_type_enum_old"`,
    );
    await queryRunner.query(`
      CREATE TYPE "public"."chat_rooms_room_type_enum"
      AS ENUM ('TRANSACTION', 'DIRECT_POST', 'DIRECT_USER')
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ALTER COLUMN "room_type" TYPE "public"."chat_rooms_room_type_enum"
      USING "room_type"::text::"public"."chat_rooms_room_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."chat_rooms_room_type_enum_old"`,
    );

    // ── Dựng lại những gì đã gỡ ────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" ALTER COLUMN "room_type" SET DEFAULT 'TRANSACTION'`,
    );
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

    // ── Phòng không bài đăng ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        ALTER COLUMN "post_id" DROP NOT NULL,
        ADD COLUMN "created_by" uuid,
        ADD CONSTRAINT "FK_chat_rooms_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("global_id"),
        ADD CONSTRAINT "CHK_chat_rooms_type_post"
          CHECK (("room_type" = 'DIRECT_USER') = ("post_id" IS NULL)),
        ADD CONSTRAINT "CHK_chat_rooms_direct_user_creator"
          CHECK (("room_type" = 'DIRECT_USER') = ("created_by" IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_chat_rooms_direct_user"
        ON "chat_rooms" (LEAST("giver_id", "receiver_id"), GREATEST("giver_id", "receiver_id"))
      WHERE "room_type" = 'DIRECT_USER'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_rooms_direct_user_creator"
        ON "chat_rooms" ("created_by", "created_at")
      WHERE "room_type" = 'DIRECT_USER'
    `);

    // ── Cài đặt nhận tin người lạ và giới hạn mở phòng ───────────────────
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "allow_stranger_messages" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES ('chat.direct_user_daily_limit', '20', 'INTEGER', 1, 'PUBLISHED',
              'Số phòng chat trực tiếp MỚI một người được mở trong 24 giờ — chống spam.')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Còn phòng DIRECT_USER thì bước chuyển type dưới đây thất bại — để Postgres từ chối chứ
    // không xoá âm thầm lịch sử chat của người dùng.
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'chat.direct_user_daily_limit'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "allow_stranger_messages"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_chat_rooms_direct_user_creator"`);
    await queryRunner.query(`DROP INDEX "UQ_chat_rooms_direct_user"`);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
        DROP CONSTRAINT "CHK_chat_rooms_direct_user_creator",
        DROP CONSTRAINT "CHK_chat_rooms_type_post",
        DROP CONSTRAINT "FK_chat_rooms_created_by",
        DROP COLUMN "created_by",
        ALTER COLUMN "post_id" SET NOT NULL
    `);
    await queryRunner.query(`DROP INDEX "UQ_chat_rooms_direct_post"`);
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" DROP CONSTRAINT "CHK_chat_rooms_type_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" ALTER COLUMN "room_type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."chat_rooms_room_type_enum" RENAME TO "chat_rooms_room_type_enum_old"`,
    );
    await queryRunner.query(`
      CREATE TYPE "public"."chat_rooms_room_type_enum" AS ENUM ('TRANSACTION', 'DIRECT_POST')
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_rooms"
      ALTER COLUMN "room_type" TYPE "public"."chat_rooms_room_type_enum"
      USING "room_type"::text::"public"."chat_rooms_room_type_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."chat_rooms_room_type_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_rooms" ALTER COLUMN "room_type" SET DEFAULT 'TRANSACTION'`,
    );
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
}
